import type {
  CacheStats,
  AccountOrderCreateInput,
  AccountOrderExchangeUpdateInput,
  AccountOrderStatus,
  AccountOrderUpdateInput,
  BalanceAllowance,
  ClobOrder,
  ClobTrade,
  DataPosition,
  DbMarket,
  DeveloperOrderRecord,
  EventListItem,
  GammaEventRaw,
  ListEventsParams,
  MarketTradeAnalysisQuery,
  MarketTradeAnalysisResult,
  MarketTradeListResult,
  MarketTradeQuery,
  MarketTradeSyncStatus,
  MarketTradeTick,
  PriceHistoryPoint,
  StrategyBotCreateInput,
  StrategyBotDetail,
  StrategyBotListItem,
  StrategyBotListParams,
  StrategyBotStatus,
  StrategyBotUpdateInput,
  StrategyCompileStatus,
  StrategyListItem,
  StrategyPlaceOrderInput,
  StrategyRunDetail,
  StrategyRunListItem,
  StrategyRunListParams,
  StrategyRunLogEntry,
  StrategyRunOrderRecord,
  StrategyRunStatus,
  StrategyVersionSummary,
  PolymarketWalletCreationType,
  PolymarketBridgeTransactionStatus,
  PolymarketBridgeTransactionStatusResponse,
  PolymarketBridgeAddressResponse,
  PolymarketBridgeWithdrawalRecord,
  PolymarketBridgeWithdrawalStatus,
  PolymarketWalletInitializationStatus,
  PolymarketWalletWalletKeyMaterialType,
  WorkflowTaskRecord,
  WorkflowTaskStatus,
  AppLocale,
  AppLocalePreference,
} from '@polytrader/shared';

interface EventRepository {
  bulkUpsert(rawEvents: GammaEventRaw[], locale: AppLocale): Promise<EventBulkUpsertStats>;
  markOpenEventsMissingFromSnapshotClosed(seenEventIds: string[]): Promise<number>;
  listEvents(params: ListEventsParams): Promise<EventListItem[]>;
  listChildEvents(parentEventId: string): Promise<EventListItem[]>;
  countEvents(params: ListEventsParams): Promise<number>;
  countEventsWithTags(tagIds: string[]): Promise<number>;
  countActiveWithTags(tagIds: string[]): Promise<number>;
  countActiveEventsByTagSets(tagSets: EventTagSetCountInput[]): Promise<EventTagSetCountResult[]>;
  getTotalCount(): Promise<number>;
  listOpenEventIds(): Promise<string[]>;
  countActive(): Promise<number>;
  countMarkets(): Promise<number>;
  getMarketByClobTokenId(assetId: string): Promise<DbMarket | null>;
  getMarketByConditionId(conditionId: string): Promise<DbMarket | null>;
  getCacheStats(): Promise<CacheStats>;
}

interface EventBulkUpsertStats {
  received: number;
  eventsUpserted: number;
  eventsSkipped: number;
  marketsUpserted: number;
  tagsUpserted: number;
}

interface EventTagSetCountInput {
  key: string;
  tagIds: string[];
}

interface EventTagSetCountResult {
  key: string;
  count: number;
}

interface WatchlistRepository {
  getWatchlistEventIds(): Promise<string[]>;
  addToWatchlist(eventId: string): Promise<boolean>;
  removeFromWatchlist(eventId: string): Promise<void>;
  countWatchlist(): Promise<number>;
  countOpenWatchlistEvents(): Promise<number>;
}

interface MetaRepository {
  getMetaValue(key: string): Promise<string | null>;
  setMetaValue(key: string, value: string): Promise<void>;
  deleteMetaValue(key: string): Promise<void>;
  getLastSyncTime(): Promise<string | null>;
  setLastSyncTime(iso?: string): Promise<void>;
}

interface AppPreferenceRecord {
  id: string;
  localePreference: AppLocalePreference;
  orderConfirmationThresholdUsd: number;
  createdAt: string;
  updatedAt: string;
}

interface AppPreferenceRepository {
  getAppPreferences(): Promise<AppPreferenceRecord | null>;
  setLocalePreference(
    preference: AppLocalePreference,
    updatedAt: string,
  ): Promise<AppPreferenceRecord>;
  setOrderConfirmationThresholdUsd(
    thresholdUsd: number,
    updatedAt: string,
  ): Promise<AppPreferenceRecord>;
}

interface AccountDataRepository {
  getCachedOrderByExchangeOrderId(
    walletId: string,
    exchangeOrderId: string,
  ): Promise<CachedAccountOrder | null>;
  listCachedOpenOrders(walletId: string, conditionId?: string): Promise<ClobOrder[]>;
  listActiveWalletOrdersMissingFromSnapshot(
    walletId: string,
    seenExchangeOrderIds: string[],
  ): Promise<ClobOrder[]>;
  listCachedTrades(walletId: string, limit?: number, conditionId?: string): Promise<ClobTrade[]>;
  listCachedPositions(walletId: string, conditionId?: string): Promise<DataPosition[]>;
  insertAccountOrder(input: AccountOrderCreateInput): Promise<void>;
  updateAccountOrder(input: AccountOrderUpdateInput): Promise<void>;
  upsertWalletOrders(walletId: string, orders: ClobOrder[]): Promise<void>;
  updateAccountOrderByExchangeOrderId(input: AccountOrderExchangeUpdateInput): Promise<void>;
  updateWalletOrdersByExchangeOrderIds(
    walletId: string,
    exchangeOrderIds: string[],
    input: Omit<AccountOrderUpdateInput, 'walletId' | 'orderId' | 'exchangeOrderId'>,
  ): Promise<void>;
  markAccountOrderInactiveByExchangeOrderId(
    walletId: string,
    exchangeOrderId: string,
  ): Promise<boolean>;
  deleteFailedAccountOrder(walletId: string, orderId: string): Promise<boolean>;
  updateActiveWalletOrdersByAccount(
    walletId: string,
    input: Omit<AccountOrderUpdateInput, 'walletId' | 'orderId' | 'exchangeOrderId'>,
  ): Promise<void>;
  upsertWalletTrades(walletId: string, trades: ClobTrade[]): Promise<void>;
  upsertWalletPositions(walletId: string, positions: DataPosition[]): Promise<void>;
}

interface CachedAccountOrder {
  order: ClobOrder;
  active: boolean;
  status: AccountOrderStatus;
}

interface PolymarketWalletRecord {
  id: string;
  name: string;
  creationType: PolymarketWalletCreationType;
  walletKeyMaterial: string;
  walletKeyMaterialType: PolymarketWalletWalletKeyMaterialType;
  parentWalletId: string | null;
  derivationPath: string | null;
  walletAddress: string;
  apiKey: string;
  secret: string;
  passphrase: string;
  depositWalletAddress: string;
  balance: BalanceAllowance | null;
  positionsTotalValue: number | null;
  positionsInitialValue: number | null;
  relayerApiKey: string;
  signatureType: number;
  chainId: number;
  clobHost: string;
  initializationStatus: PolymarketWalletInitializationStatus;
  initializationError: string;
  keyMaterialBackedUp: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

type PolymarketWalletFields = Omit<
  PolymarketWalletRecord,
  'id' | 'balance' | 'positionsTotalValue' | 'positionsInitialValue' | 'createdAt' | 'updatedAt'
>;

interface PolymarketWalletRepository {
  list(): Promise<PolymarketWalletRecord[]>;
  listConfigured(): Promise<PolymarketWalletRecord[]>;
  get(id: string): Promise<PolymarketWalletRecord>;
  getDefault(): Promise<PolymarketWalletRecord | null>;
  getDefaultConfigured(): Promise<PolymarketWalletRecord | null>;
  insert(fields: PolymarketWalletFields): Promise<PolymarketWalletRecord>;
  update(id: string, fields: PolymarketWalletFields): Promise<PolymarketWalletRecord>;
  updateInitialization(
    id: string,
    fields: PolymarketWalletInitializationUpdateFields,
  ): Promise<PolymarketWalletRecord>;
  updateInitializationCredentials(
    id: string,
    fields: PolymarketWalletInitializationCredentialFields,
  ): Promise<PolymarketWalletRecord>;
  updateBalance(id: string, balance: BalanceAllowance | null): Promise<boolean>;
  updatePositionSummary(id: string, summary: PolymarketWalletPositionSummary): Promise<boolean>;
  markKeyMaterialBackedUp(id: string): Promise<PolymarketWalletRecord>;
  setDefault(id: string): Promise<PolymarketWalletRecord>;
  delete(id: string): Promise<void>;
}

interface PolymarketWalletPositionSummary {
  positionsTotalValue: number | null;
  positionsInitialValue: number | null;
}

interface PolymarketWalletInitializationUpdateFields {
  initializationStatus: PolymarketWalletInitializationStatus;
  initializationError?: string;
}

interface PolymarketWalletInitializationCredentialFields {
  apiKey: string;
  secret: string;
  passphrase: string;
  depositWalletAddress: string;
  signatureType: number;
  chainId: number;
  clobHost: string;
}

interface PolymarketWithdrawalCreateInput {
  walletId: string;
  walletAddress: string;
  depositWalletAddress: string;
  amount: string;
  amountBaseUnits: string;
  fromChainId: string;
  fromTokenAddress: string;
  toChainId: string;
  toTokenAddress: string;
  recipientAddress: string;
}

interface PolymarketWithdrawalUpdateInput {
  status?: PolymarketBridgeWithdrawalStatus;
  bridgeAddress?: string | null;
  bridgeResponse?: PolymarketBridgeAddressResponse | null;
  bridgeStatus?: PolymarketBridgeTransactionStatus | string | null;
  bridgeStatusResponse?: PolymarketBridgeTransactionStatusResponse | null;
  relayerTransactionId?: string | null;
  relayerTransactionState?: string | null;
  relayerTransactionHash?: string | null;
  errorMessage?: string | null;
  submittedAt?: string | null;
  completedAt?: string | null;
}

interface PolymarketWithdrawalRepository {
  create(input: PolymarketWithdrawalCreateInput): Promise<PolymarketBridgeWithdrawalRecord>;
  get(id: string): Promise<PolymarketBridgeWithdrawalRecord>;
  listByWallet(walletId: string, limit?: number): Promise<PolymarketBridgeWithdrawalRecord[]>;
  listRecent(limit?: number): Promise<PolymarketBridgeWithdrawalRecord[]>;
  update(
    id: string,
    input: PolymarketWithdrawalUpdateInput,
  ): Promise<PolymarketBridgeWithdrawalRecord>;
}

interface WorkflowTaskCreateInput {
  type: string;
  groupKey: string;
  payloadJson: string;
  idempotencyKey?: string | null;
  maxAttempts?: number;
  nextRunAt?: string | null;
}

interface WorkflowTaskUpdateInput {
  status?: WorkflowTaskStatus;
  resultJson?: string | null;
  errorMessage?: string | null;
  attemptCount?: number;
  nextRunAt?: string | null;
  lockedAt?: string | null;
  lockedBy?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
}

interface WorkflowTaskRepository {
  create(input: WorkflowTaskCreateInput): Promise<WorkflowTaskRecord>;
  get(id: string): Promise<WorkflowTaskRecord>;
  listRecent(limit?: number): Promise<WorkflowTaskRecord[]>;
  listDue(now: string, limit: number): Promise<WorkflowTaskRecord[]>;
  claim(id: string, workerId: string, now: string): Promise<WorkflowTaskRecord | null>;
  cancelPendingByGroup(groupKey: string, now: string): Promise<number>;
  update(id: string, input: WorkflowTaskUpdateInput): Promise<WorkflowTaskRecord>;
}

interface StrategyRecord {
  id: string;
  name: string;
  currentVersion: number;
  sourceCode: string;
  compiledCode: string | null;
  compileStatus: StrategyCompileStatus;
  compileError: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface StrategyVersionRecord {
  id: string;
  strategyId: string;
  version: number;
  name: string;
  sourceCode: string;
  compiledCode: string | null;
  compileStatus: StrategyCompileStatus;
  compileError: string | null;
  createdAt: string;
}

interface StrategyCatalogCreateRecordInput {
  id: string;
  versionId: string;
  name: string;
  sourceCode: string;
  compiledCode: string | null;
  compileStatus: StrategyCompileStatus;
  compileError: string | null;
  createdAt: string;
}

interface StrategyCatalogUpdateRecordInput {
  id: string;
  name: string;
  sourceCode: string;
  compiledCode: string | null;
  compileStatus: StrategyCompileStatus;
  compileError: string | null;
  nextVersion: number;
  versionId: string;
  updatedAt: string;
}

interface StrategyCatalogRepository {
  listStrategies(): Promise<StrategyListItem[]>;
  getStrategy(id: string): Promise<StrategyRecord | null>;
  getStrategyVersion(strategyId: string, version: number): Promise<StrategyVersionRecord | null>;
  createStrategy(input: StrategyCatalogCreateRecordInput): Promise<StrategyRecord>;
  updateStrategy(input: StrategyCatalogUpdateRecordInput): Promise<StrategyRecord>;
  listStrategyVersions(strategyId: string): Promise<StrategyVersionSummary[]>;
  deleteStrategy(id: string, deletedAt: string): Promise<void>;
}

interface StrategyRunCreateRecordInput {
  id: string;
  botId?: string | null;
  marketId: string;
  eventId: string;
  conditionId: string | null;
  marketSnapshot: unknown;
  outcomesSnapshot: unknown;
  assetId: string;
  strategy: StrategyRecord;
  version: StrategyVersionRecord | StrategyRecord;
  strategyVersion: number;
  sourceCode: string;
  compiledCode: string;
  walletId: string;
  walletName: string;
  config: string;
  startedAt: string;
}

interface StrategyRunOrderInsertInput {
  id: string;
  runId: string;
  walletId: string;
  strategyId: string;
  strategyVersion: number;
  marketId: string;
  conditionId: string;
  input: StrategyPlaceOrderInput;
  request: Record<string, unknown>;
  response: unknown;
  success: boolean;
  errorMessage: string | null;
  submittedAt: string;
}

interface StrategyRunRepository {
  markUnfinishedRunsInterrupted(stoppedAt: string): Promise<void>;
  createRun(input: StrategyRunCreateRecordInput): Promise<StrategyRunDetail>;
  updateRunStatus(
    id: string,
    status: StrategyRunStatus,
    error: string | null,
    updatedAt: string,
    stoppedAt?: string | null,
  ): Promise<StrategyRunDetail>;
  getRun(id: string): Promise<StrategyRunDetail>;
  findActiveByMarket(marketId: string): Promise<StrategyRunDetail | null>;
  listRuns(params?: StrategyRunListParams): Promise<StrategyRunListItem[]>;
  insertLog(input: {
    id: string;
    runId: string;
    level: string;
    message: string;
    module: string;
    time: string;
  }): Promise<StrategyRunLogEntry>;
  listLogs(runId: string, limit?: number): Promise<StrategyRunLogEntry[]>;
  insertOrder(input: StrategyRunOrderInsertInput): Promise<StrategyRunOrderRecord>;
  listOrders(runId: string, limit?: number): Promise<StrategyRunOrderRecord[]>;
  getStrategy(id: string): Promise<StrategyRecord>;
  getBot(id: string): Promise<StrategyBotRecord>;
  getAccount(id: string): Promise<StrategyAccountRecord>;
  resolveStrategyVersion(
    strategy: StrategyRecord,
    versionNumber?: number | null,
  ): Promise<StrategyVersionRecord | StrategyRecord>;
}

interface StrategyAccountRecord {
  id: string;
  name: string;
}

interface StrategyBotRecord {
  id: string;
  name: string;
  marketId: string;
  eventId: string;
  conditionId: string | null;
  assetId: string;
  strategyId: string;
  strategyVersion: number;
  walletId: string;
  config: string;
  autoStart: boolean;
  enabled: boolean;
  status: StrategyBotStatus;
  activeRunId: string | null;
  runtimeError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface StrategyBotRepository {
  markUnfinishedBotsInterrupted(updatedAt: string): Promise<void>;
  list(params?: StrategyBotListParams): Promise<StrategyBotListItem[]>;
  create(input: StrategyBotCreateInput, id: string, createdAt: string): Promise<StrategyBotDetail>;
  update(input: StrategyBotUpdateInput, updatedAt: string): Promise<StrategyBotDetail>;
  updateRuntimeStatus(
    id: string,
    status: StrategyBotStatus,
    activeRunId: string | null,
    runtimeError: string | null,
    updatedAt: string,
  ): Promise<StrategyBotDetail>;
  delete(id: string): Promise<void>;
  get(id: string): Promise<StrategyBotDetail>;
  getRecord(id: string): Promise<StrategyBotRecord>;
  getActiveRun(botId: string): Promise<StrategyRunDetail | null>;
}

interface McpServerAccessLogInsertInput {
  id: string;
  requestId: string;
  sessionId: string | null;
  method: string;
  path: string;
  statusCode: number | null;
  rpcMethod: string | null;
  toolName: string | null;
  resourceUri: string | null;
  success: boolean;
  durationMs: number | null;
  clientHost: string | null;
  userAgent: string | null;
  errorCode: number | null;
  errorMessage: string | null;
  createdAt: string;
}

type McpServerAccessLogRecord = McpServerAccessLogInsertInput;

interface McpServerAccessLogListParams {
  limit?: number;
  sessionId?: string;
  rpcMethod?: string;
  toolName?: string;
  success?: boolean;
}

interface McpServerAccessLogRepository {
  insertLog(input: McpServerAccessLogInsertInput): Promise<void>;
  listLogs(params?: McpServerAccessLogListParams): Promise<McpServerAccessLogRecord[]>;
}

interface DeveloperDiagnosticsRepository {
  listMcpAccessLogs(limit?: number): Promise<McpServerAccessLogRecord[]>;
  listOrderRecords(limit?: number): Promise<DeveloperOrderRecord[]>;
}

type MarketTradeRepositoryQuery = Omit<MarketTradeQuery, 'marketId' | 'conditionId'>;

type MarketTradeAnalysisRepositoryQuery = Omit<
  MarketTradeAnalysisQuery,
  'marketId' | 'conditionId'
>;

interface MarketTradeRepository {
  upsertMarketTrades(trades: MarketTradeTick[]): Promise<number>;
  countMarketTrades(): Promise<number>;
  listMarketTrades(
    query: MarketTradeRepositoryQuery,
    syncStatus: MarketTradeSyncStatus,
  ): Promise<MarketTradeListResult>;
  getMarketTradeAnalysis(
    query: MarketTradeAnalysisRepositoryQuery,
    syncStatus: MarketTradeSyncStatus,
  ): Promise<MarketTradeAnalysisResult>;
}

type MarketTradeRepositoryCreator = (
  marketId: string,
  conditionId: string,
) => MarketTradeRepository;

type MarketPriceHistoryFidelity = 1 | 5 | 15 | 30 | 60 | 240 | 1440 | 10080;

interface MarketPriceHistoryQuery {
  marketId: string;
  conditionId?: string | null;
  tokenIds: string[];
  interval: string;
  fidelity: number;
}

interface MarketPriceHistoryUpsertInput {
  marketId: string;
  conditionId?: string | null;
  tokenId: string;
  outcome?: string | null;
  interval: string;
  fidelity: number;
  points: PriceHistoryPoint[];
  fetchedAt: string;
}

interface MarketPriceHistorySyncState {
  marketId: string;
  conditionId: string | null;
  tokenId: string;
  interval: string;
  fidelity: MarketPriceHistoryFidelity;
  lastFetchedAt: string | null;
  pointCount: number;
  error: string | null;
}

interface MarketPriceHistorySyncStateInput {
  marketId: string;
  conditionId?: string | null;
  tokenId: string;
  interval: string;
  fidelity: number;
  pointCount: number;
  error?: string | null;
  fetchedAt: string;
}

interface MarketPriceHistoryRepository {
  listPriceHistory(query: MarketPriceHistoryQuery): Promise<Record<string, PriceHistoryPoint[]>>;
  upsertPriceHistory(input: MarketPriceHistoryUpsertInput): Promise<number>;
  getSyncState(query: MarketPriceHistoryQuery): Promise<MarketPriceHistorySyncState[]>;
  markSyncState(input: MarketPriceHistorySyncStateInput): Promise<void>;
}

type MarketPriceHistoryRepositoryCreator = (
  marketId: string,
  conditionId?: string | null,
) => MarketPriceHistoryRepository;

export type {
  AccountDataRepository,
  AppPreferenceRecord,
  AppPreferenceRepository,
  CachedAccountOrder,
  StrategyAccountRecord,
  StrategyBotRecord,
  StrategyBotRepository,
  StrategyCatalogCreateRecordInput,
  StrategyCatalogRepository,
  StrategyCatalogUpdateRecordInput,
  StrategyRecord,
  StrategyRunCreateRecordInput,
  StrategyRunOrderInsertInput,
  StrategyRunRepository,
  StrategyVersionRecord,
  DbMarket,
  DeveloperDiagnosticsRepository,
  DeveloperOrderRecord,
  EventBulkUpsertStats,
  EventRepository,
  EventTagSetCountInput,
  EventTagSetCountResult,
  MarketTradeAnalysisRepositoryQuery,
  MarketPriceHistoryFidelity,
  MarketPriceHistoryQuery,
  MarketPriceHistoryRepository,
  MarketPriceHistoryRepositoryCreator,
  MarketPriceHistorySyncState,
  MarketPriceHistorySyncStateInput,
  MarketPriceHistoryUpsertInput,
  MarketTradeRepositoryCreator,
  MarketTradeRepository,
  MarketTradeRepositoryQuery,
  McpServerAccessLogInsertInput,
  McpServerAccessLogListParams,
  McpServerAccessLogRecord,
  McpServerAccessLogRepository,
  MetaRepository,
  PolymarketWithdrawalCreateInput,
  PolymarketWithdrawalRepository,
  PolymarketWithdrawalUpdateInput,
  PolymarketWalletFields,
  PolymarketWalletInitializationCredentialFields,
  PolymarketWalletInitializationUpdateFields,
  PolymarketWalletPositionSummary,
  PolymarketWalletRecord,
  PolymarketWalletRepository,
  WatchlistRepository,
  WorkflowTaskCreateInput,
  WorkflowTaskRecord,
  WorkflowTaskRepository,
  WorkflowTaskUpdateInput,
};
