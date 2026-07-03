import type {
  AccountDataRepository,
  DeveloperDiagnosticsRepository,
  EventRepository,
  MetaRepository,
  McpServerAccessLogRepository,
  AppPreferenceRepository,
  StrategyBotRepository,
  StrategyCatalogRepository,
  StrategyRunRepository,
  PolymarketWalletRepository,
  WatchlistRepository,
  WorkflowTaskRepository,
} from '@polytrader/repository-contract';
import { createRepositoryProxy } from './repositoryProxy.js';

function createSqliteAccountDataRepository(): AccountDataRepository {
  return createRepositoryProxy<AccountDataRepository>('accountData');
}

function createSqliteDeveloperDiagnosticsRepository(): DeveloperDiagnosticsRepository {
  return createRepositoryProxy<DeveloperDiagnosticsRepository>('developerDiagnostics');
}

function createSqliteEventRepository(): EventRepository {
  return createRepositoryProxy<EventRepository>('event');
}

function createSqliteMetaRepository(): MetaRepository {
  return createRepositoryProxy<MetaRepository>('meta');
}

function createSqliteMcpServerAccessLogRepository(): McpServerAccessLogRepository {
  return createRepositoryProxy<McpServerAccessLogRepository>('mcpServerAccessLog');
}

function createSqlitePreferenceRepository(): AppPreferenceRepository {
  return createRepositoryProxy<AppPreferenceRepository>('preference');
}

function createSqliteStrategyBotRepository(): StrategyBotRepository {
  return createRepositoryProxy<StrategyBotRepository>('strategyBot');
}

function createSqliteStrategyCatalogRepository(): StrategyCatalogRepository {
  return createRepositoryProxy<StrategyCatalogRepository>('strategyCatalog');
}

function createSqliteStrategyRunRepository(): StrategyRunRepository {
  return createRepositoryProxy<StrategyRunRepository>('strategyRun');
}

function createSqlitePolymarketWalletRepository(): PolymarketWalletRepository {
  return createRepositoryProxy<PolymarketWalletRepository>('polymarketWallet');
}

function createSqliteWatchlistRepository(): WatchlistRepository {
  return createRepositoryProxy<WatchlistRepository>('watchlist');
}

function createSqliteWorkflowTaskRepository(): WorkflowTaskRepository {
  return createRepositoryProxy<WorkflowTaskRepository>('workflowTask');
}

export {
  createSqliteAccountDataRepository,
  createSqliteDeveloperDiagnosticsRepository,
  createSqliteEventRepository,
  createSqliteMetaRepository,
  createSqliteMcpServerAccessLogRepository,
  createSqlitePreferenceRepository,
  createSqliteStrategyBotRepository,
  createSqliteStrategyCatalogRepository,
  createSqliteStrategyRunRepository,
  createSqlitePolymarketWalletRepository,
  createSqliteWatchlistRepository,
  createSqliteWorkflowTaskRepository,
};
