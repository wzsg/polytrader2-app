import { SqliteAccountDataRepository } from './repositories/accountDataRepository.js';
import { SqliteDeveloperDiagnosticsRepository } from './repositories/developerDiagnosticsRepository.js';
import { SqliteEventRepository } from './repositories/eventRepository.js';
import { SqliteMetaRepository } from './repositories/metaRepository.js';
import { SqliteMcpServerAccessLogRepository } from './repositories/mcpAccessLogRepository.js';
import { SqlitePreferenceRepository } from './repositories/preferenceRepository.js';
import { SqliteStrategyBotRepository } from './repositories/strategyBotRepository.js';
import { SqliteStrategyCatalogRepository } from './repositories/strategyCatalogRepository.js';
import { SqliteStrategyRunRepository } from './repositories/strategyRunRepository.js';
import { SqlitePolymarketWalletRepository } from './repositories/polymarketWalletRepository.js';
import { SqliteWatchlistRepository } from './repositories/watchlistRepository.js';
import { SqliteWorkflowTaskRepository } from './repositories/workflowTaskRepository.js';

function createSyncSqliteAccountDataRepository(): SqliteAccountDataRepository {
  return new SqliteAccountDataRepository();
}

function createSyncSqliteDeveloperDiagnosticsRepository(): SqliteDeveloperDiagnosticsRepository {
  return new SqliteDeveloperDiagnosticsRepository();
}

function createSyncSqliteEventRepository(): SqliteEventRepository {
  return new SqliteEventRepository();
}

function createSyncSqliteMetaRepository(): SqliteMetaRepository {
  return new SqliteMetaRepository();
}

function createSyncSqliteMcpServerAccessLogRepository(): SqliteMcpServerAccessLogRepository {
  return new SqliteMcpServerAccessLogRepository();
}

function createSyncSqlitePreferenceRepository(): SqlitePreferenceRepository {
  return new SqlitePreferenceRepository();
}

function createSyncSqliteStrategyBotRepository(): SqliteStrategyBotRepository {
  return new SqliteStrategyBotRepository();
}

function createSyncSqliteStrategyCatalogRepository(): SqliteStrategyCatalogRepository {
  return new SqliteStrategyCatalogRepository();
}

function createSyncSqliteStrategyRunRepository(): SqliteStrategyRunRepository {
  return new SqliteStrategyRunRepository();
}

function createSyncSqlitePolymarketWalletRepository(): SqlitePolymarketWalletRepository {
  return new SqlitePolymarketWalletRepository();
}

function createSyncSqliteWatchlistRepository(): SqliteWatchlistRepository {
  return new SqliteWatchlistRepository();
}

function createSyncSqliteWorkflowTaskRepository(): SqliteWorkflowTaskRepository {
  return new SqliteWorkflowTaskRepository();
}

export {
  createSyncSqliteAccountDataRepository,
  createSyncSqliteDeveloperDiagnosticsRepository,
  createSyncSqliteEventRepository,
  createSyncSqliteMetaRepository,
  createSyncSqliteMcpServerAccessLogRepository,
  createSyncSqlitePreferenceRepository,
  createSyncSqliteStrategyBotRepository,
  createSyncSqliteStrategyCatalogRepository,
  createSyncSqliteStrategyRunRepository,
  createSyncSqlitePolymarketWalletRepository,
  createSyncSqliteWatchlistRepository,
  createSyncSqliteWorkflowTaskRepository,
};
