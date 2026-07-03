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
let initPromise: Promise<void> | null = null;
const pendingRequests = new Map<string, PendingRequest>();

function initDb(options: InitDbOptions): Promise<void> {
  if (initPromise) return initPromise;
  const workerScriptPath = options.workerScriptPath || resolveDefaultWorkerScriptPath();
  worker = new Worker(workerScriptPath);
  worker.on('message', handleWorkerMessage);
  worker.on('error', handleWorkerFailure);
  worker.on('exit', (code) => {
    if (code !== 0) handleWorkerFailure(new Error(`SQLite worker exited with code ${code}`));
    worker = null;
    initPromise = null;
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

async function closeDb(): Promise<void> {
  const currentWorker = worker;
  if (!currentWorker) return;
  try {
    await sendWorkerRequest({
      id: randomUUID(),
      type: 'close',
    });
  } finally {
    await currentWorker.terminate();
    worker = null;
    initPromise = null;
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
