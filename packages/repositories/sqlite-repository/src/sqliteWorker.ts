import { parentPort } from 'worker_threads';
import { closeDirectDb, initDirectDb } from './client.js';
import type {
  SqliteRepositoryName,
  SqliteWorkerErrorPayload,
  SqliteWorkerRequest,
  SqliteWorkerResponse,
} from './sqliteWorkerProtocol.js';
import {
  createSyncSqliteAccountDataRepository,
  createSyncSqliteDeveloperDiagnosticsRepository,
  createSyncSqliteEventRepository,
  createSyncSqliteMetaRepository,
  createSyncSqliteMcpServerAccessLogRepository,
  createSyncSqlitePreferenceRepository,
  createSyncSqlitePolymarketWalletRepository,
  createSyncSqliteStrategyBotRepository,
  createSyncSqliteStrategyCatalogRepository,
  createSyncSqliteStrategyRunRepository,
  createSyncSqliteWatchlistRepository,
  createSyncSqliteWorkflowTaskRepository,
} from './syncRepositoryFactory.js';

type RepositoryInstance = Record<string, (...args: unknown[]) => unknown>;
type RepositoryMap = Record<SqliteRepositoryName, RepositoryInstance>;

let repositories: RepositoryMap | null = null;

function createRepositories(): RepositoryMap {
  return {
    accountData: createSyncSqliteAccountDataRepository() as unknown as RepositoryInstance,
    developerDiagnostics:
      createSyncSqliteDeveloperDiagnosticsRepository() as unknown as RepositoryInstance,
    event: createSyncSqliteEventRepository() as unknown as RepositoryInstance,
    meta: createSyncSqliteMetaRepository() as unknown as RepositoryInstance,
    mcpServerAccessLog:
      createSyncSqliteMcpServerAccessLogRepository() as unknown as RepositoryInstance,
    preference: createSyncSqlitePreferenceRepository() as unknown as RepositoryInstance,
    polymarketWallet: createSyncSqlitePolymarketWalletRepository() as unknown as RepositoryInstance,
    strategyBot: createSyncSqliteStrategyBotRepository() as unknown as RepositoryInstance,
    strategyCatalog: createSyncSqliteStrategyCatalogRepository() as unknown as RepositoryInstance,
    strategyRun: createSyncSqliteStrategyRunRepository() as unknown as RepositoryInstance,
    watchlist: createSyncSqliteWatchlistRepository() as unknown as RepositoryInstance,
    workflowTask: createSyncSqliteWorkflowTaskRepository() as unknown as RepositoryInstance,
  };
}

async function handleRequest(message: SqliteWorkerRequest): Promise<void> {
  try {
    const result = await dispatchRequest(message);
    postResponse({ id: message.id, ok: true, result });
  } catch (error) {
    postResponse({ id: message.id, ok: false, error: serializeError(error) });
  }
}

async function dispatchRequest(message: SqliteWorkerRequest): Promise<unknown> {
  if (message.type === 'init') {
    initDirectDb(message.options);
    repositories = createRepositories();
    return undefined;
  }

  if (message.type === 'close') {
    closeDirectDb();
    repositories = null;
    return undefined;
  }

  if (!repositories) throw new Error('SQLite worker has not been initialized');
  const repository = repositories[message.repository];
  const method = repository[message.method];
  if (typeof method !== 'function') {
    throw new Error(`Unknown SQLite repository method: ${message.repository}.${message.method}`);
  }
  return method.apply(repository, message.args);
}

function postResponse(response: SqliteWorkerResponse): void {
  parentPort?.postMessage(response);
}

function serializeError(error: unknown): SqliteWorkerErrorPayload {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message,
      stack: error.stack,
    };
  }
  return {
    name: 'Error',
    message: String(error),
  };
}

if (!parentPort) {
  throw new Error('SQLite worker must run inside worker_threads');
}

parentPort.on('message', (message: SqliteWorkerRequest) => {
  void handleRequest(message);
});
