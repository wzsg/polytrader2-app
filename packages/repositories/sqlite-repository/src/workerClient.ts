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
let databaseClosing = false;
const pendingRequests = new Map<string, PendingRequest>();
const activeRepositoryRequests = new Set<Promise<unknown>>();

function initDb(options: InitDbOptions): Promise<void> {
  if (closePromise) return closePromise.then(() => initDb(options));
  if (initPromise) return initPromise;
  databaseClosing = false;
  const workerScriptPath = options.workerScriptPath || resolveDefaultWorkerScriptPath();
  const nextWorker = new Worker(workerScriptPath);
  worker = nextWorker;
  nextWorker.on('message', handleWorkerMessage);
  nextWorker.on('error', (error) => {
    const workerError = error instanceof Error ? error : new Error(String(error));
    console.error('SQLite worker failed', workerError);
    handleWorkerFailure(workerError);
  });
  nextWorker.on('exit', (code) => {
    const expectedExit = terminatingWorker === nextWorker;
    if (!expectedExit) {
      const error = new Error(`SQLite worker exited with code ${code}`);
      console.error('SQLite worker exited unexpectedly', error);
      handleWorkerFailure(error);
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
  databaseClosing = true;
  if (closePromise) return closePromise;
  const currentWorker = worker;
  if (!currentWorker) return waitForActiveRepositoryRequests();

  const trackedPromise = finishClosingDb(currentWorker).finally(() => {
    if (closePromise === trackedPromise) closePromise = null;
  });
  closePromise = trackedPromise;
  return trackedPromise;
}

async function finishClosingDb(currentWorker: Worker): Promise<void> {
  await waitForActiveRepositoryRequests();
  const closeRequest = sendWorkerRequest({
    id: randomUUID(),
    type: 'close',
  });
  closingWorker = currentWorker;
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
  if (databaseClosing) return Promise.reject(createDatabaseClosingError());
  const request = sendWorkerRequest({
    id: randomUUID(),
    type: 'call',
    repository,
    method,
    args,
  });
  trackRepositoryRequest(request);
  return request as Promise<T>;
}

function trackRepositoryRequest(request: Promise<unknown>): void {
  activeRepositoryRequests.add(request);
  void request.then(
    () => activeRepositoryRequests.delete(request),
    () => activeRepositoryRequests.delete(request),
  );
}

async function waitForActiveRepositoryRequests(): Promise<void> {
  while (activeRepositoryRequests.size > 0) {
    await Promise.allSettled([...activeRepositoryRequests]);
  }
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

function createDatabaseClosingError(): Error {
  const error = new Error('SQLite database is shutting down');
  error.name = 'AbortError';
  return error;
}

function resolveDefaultWorkerScriptPath(): string {
  return fileURLToPath(new URL('./sqliteWorker.js', import.meta.url));
}

export { callSqliteRepository, closeDb, initDb };
export type { InitDbOptions };
