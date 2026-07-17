import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { Worker } from 'worker_threads';
import type {
  SqliteRepositoryName,
  SqliteWorkerInitOptions,
  SqliteWorkerRequest,
  SqliteWorkerResponse,
} from './sqliteWorkerProtocol.js';

interface InitDbOptions extends SqliteWorkerInitOptions {
  workerScriptPath?: string;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

let worker: Worker | null = null;
let closingWorker: Worker | null = null;
let terminatingWorker: Worker | null = null;
let initPromise: Promise<void> | null = null;
let closePromise: Promise<void> | null = null;
const pendingRequests = new Map<string, PendingRequest>();

function initDb(options: InitDbOptions): Promise<void> {
  if (initPromise) return initPromise;
  const workerScriptPath = options.workerScriptPath || resolveDefaultWorkerScriptPath();
  const nextWorker = new Worker(workerScriptPath);
  worker = nextWorker;
  nextWorker.on('message', handleWorkerMessage);
  nextWorker.on('error', handleWorkerFailure);
  nextWorker.on('exit', (code) => {
    const expectedExit = terminatingWorker === nextWorker;
    if (!expectedExit) {
      handleWorkerFailure(new Error(`SQLite worker exited with code ${code}`));
    }
    if (worker === nextWorker) {
      worker = null;
      initPromise = null;
    }
    if (closingWorker === nextWorker) closingWorker = null;
    if (terminatingWorker === nextWorker) terminatingWorker = null;
  });

  initPromise = sendWorkerRequest({
    id: randomUUID(),
    type: 'init',
    options: {
      userDataPath: options.userDataPath,
      migrationsFolder: options.migrationsFolder,
    },
  }).then(() => undefined);
  return initPromise;
}

function closeDb(): Promise<void> {
  if (closePromise) return closePromise;
  const currentWorker = worker;
  if (!currentWorker) return Promise.resolve();
  const closeRequest = sendWorkerRequest({
    id: randomUUID(),
    type: 'close',
  });
  closingWorker = currentWorker;

  const trackedPromise = finishClosingDb(currentWorker, closeRequest).finally(() => {
    if (closePromise === trackedPromise) closePromise = null;
  });
  closePromise = trackedPromise;
  return trackedPromise;
}

async function finishClosingDb(
  currentWorker: Worker,
  closeRequest: Promise<unknown>,
): Promise<void> {
  try {
    await closeRequest;
  } finally {
    terminatingWorker = currentWorker;
    await currentWorker.terminate();
    if (worker === currentWorker) {
      worker = null;
      initPromise = null;
    }
    if (closingWorker === currentWorker) closingWorker = null;
    if (terminatingWorker === currentWorker) terminatingWorker = null;
  }
}

function callSqliteRepository<T>(
  repository: SqliteRepositoryName,
  method: string,
  args: unknown[],
): Promise<T> {
  return sendWorkerRequest({
    id: randomUUID(),
    type: 'call',
    repository,
    method,
    args,
  }) as Promise<T>;
}

function sendWorkerRequest(request: SqliteWorkerRequest): Promise<unknown> {
  const currentWorker = worker;
  if (!currentWorker) return Promise.reject(new Error('SQLite worker is not initialized'));
  if (closingWorker === currentWorker) {
    return Promise.reject(new Error('SQLite worker is closing'));
  }
  return new Promise((resolve, reject) => {
    pendingRequests.set(request.id, { resolve, reject });
    currentWorker.postMessage(request);
  });
}

function handleWorkerMessage(message: SqliteWorkerResponse): void {
  const pending = pendingRequests.get(message.id);
  if (!pending) return;
  pendingRequests.delete(message.id);
  if (message.ok) {
    pending.resolve(message.result);
    return;
  }
  pending.reject(errorFromPayload(message.error));
}

function handleWorkerFailure(error: Error): void {
  for (const pending of pendingRequests.values()) {
    pending.reject(error);
  }
  pendingRequests.clear();
}

function errorFromPayload(payload: { name: string; message: string; stack?: string }): Error {
  const error = new Error(payload.message);
  error.name = payload.name || 'Error';
  if (payload.stack) error.stack = payload.stack;
  return error;
}

function resolveDefaultWorkerScriptPath(): string {
  return fileURLToPath(new URL('./sqliteWorker.js', import.meta.url));
}

export { callSqliteRepository, closeDb, initDb };
export type { InitDbOptions };
