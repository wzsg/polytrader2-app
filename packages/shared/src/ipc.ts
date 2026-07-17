import type {
  ApiResult,
  AuthEmailInput,
  AuthProvider,
  AuthProviderStartResult,
  AuthState,
  BrowserModalPayload,
  BrowserNavigateOptions,
  BrowserNavigationState,
  BrowserProviderResponseInput,
  BrowserViewBounds,
  EventCacheStats,
  ClobOrder,
  ClobTrade,
  CryptoCategoryConfig,
  CryptoEventsResult,
  DataPosition,
  DeveloperModeConfig,
  DeveloperOrderRecord,
  EventCategoryConfig,
  EventDetailItem,
  EventListItem,
  EventStatusFilter,
  Filters,
  GammaEventRaw,
  IpcRequest,
  IpcResponse,
  ListEventsParams,
  ManualPlaceOrderInput,
  MarketDetailData,
  DbMarket,
  McpServerAccessLogRecord,
  McpServerConfig,
  McpServerStatus,
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
  StrategyBotRuntimeEvent,
  StrategyBotUpdateInput,
  StrategyCompileResult,
  StrategyCreateInput,
  StrategyDetail,
  StrategyEditorWindowInput,
  StrategyListItem,
  StrategyRunDetail,
  StrategyRunListItem,
  StrategyRunListParams,
  StrategyRunLogEntry,
  StrategyRunOrderRecord,
  StrategyRunRuntimeEvent,
  StrategyUpdateInput,
  StrategyVersionSummary,
  SetupDirectorySelectionResult,
  SetupState,
  SportsCategoryConfig,
  SportsEventScope,
  SportsEventsResult,
  SportsMetadataItem,
  EventSyncScheduleConfig,
  EventSyncStatus,
  PolymarketWalletImportInput,
  PolymarketBridgeDepositInput,
  PolymarketBridgeQuoteInput,
  PolymarketBridgeQuoteResponse,
  PolymarketBridgeSupportedAssetsResponse,
  PolymarketBridgeTransactionStatusResponse,
  PolymarketBridgeWithdrawalInput,
  PolymarketBridgeWithdrawalEvent,
  PolymarketBridgeWithdrawalRecord,
  PolymarketBridgeWithdrawalSubmitResult,
  PolymarketBridgeAddressResponse,
  PolymarketWalletCreateInput,
  PolymarketWalletDerivedInput,
  PolymarketWalletEvent,
  PolymarketWalletKeyMaterialReveal,
  PolymarketWalletSummary,
  PolymarketWalletUpdateInput,
  TradingAccountDataEvent,
  TradingAccountDataQuery,
  TradingAccountScopedData,
  TradingAccountPositionMergeInput,
  TradingAccountPositionOperationResult,
  TradingAccountPositionRedeemInput,
  TradingAccountPositionSplitInput,
  TradingMarketEvent,
  TradingMarketSubscribeOptions,
  TradingRuntimeAccountState,
  TradingMarketSnapshot,
  TradingStrategyState,
  TradingStrategyStateEvent,
  TradingWindowInput,
  DataSyncResult,
  WorkflowTaskRecord,
} from './types/index.js';
import type { SystemPerformanceStatus } from '@polytrader/system-performance';
import type { AppLocale, AppLocalePreference, AppPreferences } from './i18n.js';
import type { AiAgentId, AiAgentIntegrationStatus } from './aiAgentIntegration.js';

export type {
  ApiEvent,
  ApiResult,
  AuthEmailInput,
  AuthProvider,
  AuthProviderStartResult,
  AuthState,
  AuthStatus,
  BalanceAllowance,
  BrowserNavigationState,
  BrowserModalPayload,
  BrowserNavigateOptions,
  BrowserProviderAccount,
  BrowserProviderRequest,
  BrowserProviderResponseInput,
  BrowserProviderRequestKind,
  BrowserWalletConnectionState,
  BrowserViewBounds,
  EventCacheStats,
  CryptoCategoryConfig,
  CryptoEventsResult,
  DbMarket,
  DeveloperModeConfig,
  DeveloperOrderRecord,
  EventCategoryConfig,
  EventDetailItem,
  EventListItem,
  Filters,
  GammaEventRaw,
  GammaMarketRaw,
  HolderGroup,
  ListEventsParams,
  Market,
  MarketDetailData,
  McpServerAccessLogRecord,
  McpServerConfig,
  McpServerStatus,
  MarketTradeAnalysisBucket,
  MarketTradeAnalysisBreakdown,
  MarketTradeAnalysisPoint,
  MarketTradeAnalysisQuery,
  MarketTradeAnalysisResult,
  MarketTradeAnalysisSummary,
  MarketTradeListResult,
  MarketTradeQuery,
  MarketTradeSortField,
  MarketTradeSyncStatus,
  MarketTradeSyncState,
  MarketOutcome,
  MarketTradeTick,
  PriceHistoryPoint,
  OrderBook,
  SortOrder,
  EventSyncStatus,
  WsMessage,
  ClobOrder,
  ClobTrade,
  DataPosition,
  PolymarketWalletImportInput,
  PolymarketWalletCreateInput,
  PolymarketWalletDerivedInput,
  PolymarketWalletKeyMaterialReveal,
  PolymarketWalletSummary,
  PolymarketWalletUpdateInput,
  TradingAccountDataEvent,
  TradingAccountDataQuery,
  TradingAccountPositionMergeInput,
  TradingAccountPositionOperationResult,
  TradingAccountPositionRedeemInput,
  TradingAccountPositionSplitInput,
  TradingMarketEvent,
  TradingMarketSubscribeOptions,
  TradingMarketSnapshot,
  TradingWindowInput,
  DataSyncResult,
  DataSyncState,
  ManualPlaceOrderInput,
  StrategyBotCreateInput,
  StrategyBotDetail,
  StrategyBotListItem,
  StrategyBotListParams,
  StrategyBotRuntimeEvent,
  StrategyBotStatus,
  StrategyBotUpdateInput,
  StrategyCompileResult,
  StrategyCreateInput,
  StrategyDetail,
  StrategyEditorWindowInput,
  StrategyListItem,
  StrategyUpdateInput,
  StrategyVersionSummary,
  EventSyncScheduleConfig,
  StrategyRunDetail,
  StrategyRunListItem,
  StrategyRunListParams,
  StrategyRunLogEntry,
  StrategyRunOrderRecord,
  StrategyRunRuntimeEvent,
  SetupDirectorySelectionResult,
  SetupState,
  SportsCategoryConfig,
} from './types/index.js';
export type { AppLocale, AppLocalePreference, AppPreferences } from './i18n.js';

export interface ListCryptoEventsParams {
  tagIds: string[];
  startTimeMinutes?: number;
  status?: EventStatusFilter;
  endDateMin?: string;
  endDateMax?: string;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface ListSportsEventsParams {
  scope: SportsEventScope;
  sportId?: string;
  tagIds?: string[];
  excludeTagIds?: string[];
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

type AppUpdateStatus = 'idle' | 'checking' | 'downloading' | 'downloaded' | 'error';

interface AppUpdateState {
  status: AppUpdateStatus;
  version: string | null;
}

export interface TradingAccountStatusData {
  credentialsConfigured: boolean;
  positionsConfigured: boolean;
}

interface TradingMarketIpcApi {
  subscribe: (
    input: TradingWindowInput,
    options?: TradingMarketSubscribeOptions,
  ) => Promise<ApiResult<TradingMarketSnapshot>>;
  selectToken: (
    marketId: string,
    tokenId: string,
    outcome?: string | null,
  ) => Promise<ApiResult<TradingMarketSnapshot>>;
  loadPriceHistory: (
    marketId: string,
    interval?: string,
    fidelity?: number,
  ) => Promise<ApiResult<TradingMarketSnapshot>>;
  listTrades: (
    marketId: string,
    query: MarketTradeQuery,
  ) => Promise<ApiResult<MarketTradeListResult>>;
  getTradeAnalysis: (
    marketId: string,
    query: MarketTradeAnalysisQuery,
  ) => Promise<ApiResult<MarketTradeAnalysisResult>>;
  unsubscribe: (marketId: string) => Promise<void>;
  onEvent: (callback: (event: TradingMarketEvent) => void) => () => void;
}

interface TradingStrategyIpcApi {
  getState: (marketId: string) => Promise<ApiResult<TradingStrategyState>>;
  selectRun: (marketId: string, runId: string) => Promise<ApiResult<TradingStrategyState>>;
  onEvent: (callback: (event: TradingStrategyStateEvent) => void) => () => void;
}

interface TradingAccountIpcApi {
  getStatus: (walletId: string) => Promise<ApiResult<TradingAccountStatusData>>;
  getData: (query?: TradingAccountDataQuery) => Promise<ApiResult<TradingRuntimeAccountState>>;
  getOrders: (
    query?: TradingAccountDataQuery,
  ) => Promise<ApiResult<TradingAccountScopedData<ClobOrder>>>;
  cancelOrder: (id: string, walletId: string) => Promise<ApiResult<unknown>>;
  cancelOrders: (ids: string[], walletId: string) => Promise<ApiResult<unknown>>;
  deleteFailedOrder: (id: string, walletId: string) => Promise<ApiResult<void>>;
  cancelAllOrders: (walletId: string) => Promise<ApiResult<unknown>>;
  getTrades: (
    query?: TradingAccountDataQuery,
  ) => Promise<ApiResult<TradingAccountScopedData<ClobTrade>>>;
  getPositions: (
    query?: TradingAccountDataQuery,
  ) => Promise<ApiResult<TradingAccountScopedData<DataPosition>>>;
  placeOrder: (input: ManualPlaceOrderInput) => Promise<ApiResult<unknown>>;
  splitPosition: (
    input: TradingAccountPositionSplitInput,
  ) => Promise<ApiResult<TradingAccountPositionOperationResult>>;
  mergePositions: (
    input: TradingAccountPositionMergeInput,
  ) => Promise<ApiResult<TradingAccountPositionOperationResult>>;
  redeemPositions: (
    input: TradingAccountPositionRedeemInput,
  ) => Promise<ApiResult<TradingAccountPositionOperationResult>>;
  onEvent: (callback: (event: TradingAccountDataEvent) => void) => () => void;
}

interface WalletIpcApi {
  list: () => Promise<ApiResult<PolymarketWalletSummary[]>>;
  getKeyMaterial: (id: string) => Promise<ApiResult<PolymarketWalletKeyMaterialReveal>>;
  create: (input: PolymarketWalletCreateInput) => Promise<ApiResult<PolymarketWalletSummary>>;
  createDerived: (
    input: PolymarketWalletDerivedInput,
  ) => Promise<ApiResult<PolymarketWalletSummary>>;
  import: (input: PolymarketWalletImportInput) => Promise<ApiResult<PolymarketWalletSummary>>;
  update: (input: PolymarketWalletUpdateInput) => Promise<ApiResult<PolymarketWalletSummary>>;
  markKeyMaterialBackedUp: (id: string) => Promise<ApiResult<PolymarketWalletSummary>>;
  retryInitialization: (id: string) => Promise<ApiResult<PolymarketWalletSummary>>;
  setDefault: (id: string) => Promise<ApiResult<PolymarketWalletSummary>>;
  delete: (id: string) => Promise<ApiResult<void>>;
  onEvent: (callback: (event: PolymarketWalletEvent) => void) => () => void;
}

interface CrossChainIpcApi {
  listSupportedAssets: () => Promise<ApiResult<PolymarketBridgeSupportedAssetsResponse>>;
  createDeposit: (
    input: PolymarketBridgeDepositInput,
  ) => Promise<ApiResult<PolymarketBridgeAddressResponse>>;
  quoteTransfer: (
    input: PolymarketBridgeQuoteInput,
  ) => Promise<ApiResult<PolymarketBridgeQuoteResponse>>;
  withdraw: (
    input: PolymarketBridgeWithdrawalInput,
  ) => Promise<ApiResult<PolymarketBridgeWithdrawalSubmitResult>>;
  getTransactionStatus: (
    address: string,
  ) => Promise<ApiResult<PolymarketBridgeTransactionStatusResponse>>;
  listWithdrawals: (
    walletId?: string,
    limit?: number,
  ) => Promise<ApiResult<PolymarketBridgeWithdrawalRecord[]>>;
  onWithdrawalEvent: (callback: (event: PolymarketBridgeWithdrawalEvent) => void) => () => void;
}

interface AiAgentIntegrationIpcApi {
  detectAll: () => Promise<AiAgentIntegrationStatus[]>;
  configure: (
    agentId: AiAgentId,
    options?: { replaceExisting?: boolean },
  ) => Promise<AiAgentIntegrationStatus>;
  remove: (agentId: AiAgentId) => Promise<AiAgentIntegrationStatus>;
}

export interface IpcApi {
  aiAgentIntegrations: AiAgentIntegrationIpcApi;
  getAuthState: () => Promise<AuthState>;
  signUpWithEmail: (input: AuthEmailInput) => Promise<ApiResult<AuthState>>;
  signInWithEmail: (input: AuthEmailInput) => Promise<ApiResult<AuthState>>;
  signInWithProvider: (provider: AuthProvider) => Promise<ApiResult<AuthProviderStartResult>>;
  resendSignupConfirmation: (email: string) => Promise<ApiResult<void>>;
  signOut: () => Promise<ApiResult<AuthState>>;
  runDataSync: () => Promise<ApiResult<DataSyncResult>>;
  onAuthChanged: (callback: (state: AuthState) => void) => () => void;
  getSystemPerformanceStatus: () => Promise<SystemPerformanceStatus>;
  onSystemPerformanceStatusChanged: (
    callback: (status: SystemPerformanceStatus) => void,
  ) => () => void;
  getAppPreferences: () => Promise<AppPreferences>;
  setLocalePreference: (preference: AppLocalePreference) => Promise<AppPreferences>;
  setOrderConfirmationThresholdUsd: (thresholdUsd: number) => Promise<AppPreferences>;
  setEventSyncBatchSize: (batchSize: number) => Promise<AppPreferences>;
  onPreferencesChanged: (callback: (preferences: AppPreferences) => void) => () => void;
  getSetupState: () => Promise<SetupState>;
  chooseSetupDataDirectory: (defaultPath?: string) => Promise<SetupDirectorySelectionResult>;
  validateSetupDataDirectory: (dataDirectory: string) => Promise<ApiResult<SetupState>>;
  getDataStorageDirectory: () => Promise<string>;
  chooseDataStorageDirectory: (defaultPath?: string) => Promise<SetupDirectorySelectionResult>;
  migrateDataStorage: (dataDirectory: string) => Promise<ApiResult<void>>;
  startInitialSetup: (input: {
    dataDirectory: string;
    localePreference: AppLocalePreference;
    encryptionMethod: 'keychain' | 'dpapi' | 'aes-256-gcm';
    password?: string;
    confirmPassword?: string;
  }) => Promise<ApiResult<SetupState>>;
  unlockInitialSetup: (password: string) => Promise<ApiResult<SetupState>>;
  completeInitialSetup: () => Promise<void>;
  cancelInitialSetup: () => Promise<void>;
  onSetupEventSyncStatus: (callback: (status: EventSyncStatus) => void) => () => void;
  startEventSync: () => void;
  stopEventSync: () => Promise<void>;
  onEventSyncStatus: (callback: (status: EventSyncStatus) => void) => () => void;
  getEventSyncScheduleConfig: () => Promise<EventSyncScheduleConfig>;
  setEventSyncScheduleConfig: (
    config: Partial<EventSyncScheduleConfig>,
  ) => Promise<EventSyncScheduleConfig>;
  getMcpServerConfig: () => Promise<McpServerConfig>;
  setMcpServerConfig: (config: Partial<McpServerConfig>) => Promise<McpServerConfig>;
  resetMcpServerToken: () => Promise<McpServerConfig>;
  getMcpServerStatus: () => Promise<McpServerStatus>;
  getDeveloperModeConfig: () => Promise<DeveloperModeConfig>;
  setDeveloperModeConfig: (config: Partial<DeveloperModeConfig>) => Promise<DeveloperModeConfig>;
  listDeveloperMcpAccessLogs: (limit?: number) => Promise<McpServerAccessLogRecord[]>;
  listDeveloperOrderRecords: (limit?: number) => Promise<DeveloperOrderRecord[]>;
  listDeveloperWorkflowTasks: (limit?: number) => Promise<WorkflowTaskRecord[]>;
  listEvents: (params: ListEventsParams) => Promise<EventListItem[]>;
  listChildEvents: (
    request: IpcRequest<{ parentEventId: string }>,
  ) => Promise<IpcResponse<EventDetailItem[]>>;
  listEventMarkets: (request: IpcRequest<{ eventId: string }>) => Promise<IpcResponse<DbMarket[]>>;
  countEvents: (params: ListEventsParams) => Promise<number>;
  getTotalCount: () => Promise<number>;
  countEventsByTags: (tagIds: string[]) => Promise<number>;
  countActiveByTags: (tagIds: string[]) => Promise<number>;
  getEventCacheStats: () => Promise<EventCacheStats>;
  countActive: () => Promise<number>;
  getWatchlistEventIds: () => Promise<string[]>;
  addToWatchlist: (eventId: string) => Promise<boolean>;
  removeFromWatchlist: (eventId: string) => Promise<void>;
  countWatchlist: () => Promise<number>;
  countOpenWatchlistEvents: () => Promise<number>;
  loadFilters: () => Promise<Partial<Filters> | null>;
  saveFilters: (data: Partial<Filters>) => Promise<void>;
  fetchEvent: (request: IpcRequest<{ eventId: string }>) => Promise<IpcResponse<GammaEventRaw>>;
  fetchCryptoCategory: () => Promise<CryptoCategoryConfig>;
  fetchEventCategory: () => Promise<EventCategoryConfig>;
  fetchSportsCategory: () => Promise<SportsCategoryConfig>;
  onCategoryConfigChanged: (
    callback: (event: { locale: AppLocale; scopes: Array<'event' | 'crypto' | 'sports'> }) => void,
  ) => () => void;
  listCryptoEvents: (params: ListCryptoEventsParams) => Promise<CryptoEventsResult>;
  fetchSportsMetadata: () => Promise<SportsMetadataItem[]>;
  listSportsEvents: (params: ListSportsEventsParams) => Promise<SportsEventsResult>;
  fetchMarketDetail: (marketId: string) => Promise<ApiResult<MarketDetailData>>;
  fetchMarketTrades: (conditionId: string, limit?: number) => Promise<ApiResult<MarketTradeTick[]>>;
  startMarketTradeSync: (
    marketId: string,
    conditionId: string,
  ) => Promise<ApiResult<MarketTradeSyncStatus>>;
  listMarketTrades: (query: MarketTradeQuery) => Promise<ApiResult<MarketTradeListResult>>;
  getMarketTradeAnalysis: (
    query: MarketTradeAnalysisQuery,
  ) => Promise<ApiResult<MarketTradeAnalysisResult>>;
  onMarketTradesUpdated: (callback: (status: MarketTradeSyncStatus) => void) => () => void;
  fetchPriceHistory: (
    tokenId: string,
    interval?: string,
    fidelity?: number,
  ) => Promise<ApiResult<PriceHistoryPoint[]>>;
  tradingAccount: TradingAccountIpcApi;
  wallet: WalletIpcApi;
  crossChain: CrossChainIpcApi;
  listStrategies: () => Promise<ApiResult<StrategyListItem[]>>;
  getStrategy: (id: string) => Promise<ApiResult<StrategyDetail>>;
  createStrategy: (input: StrategyCreateInput) => Promise<ApiResult<StrategyDetail>>;
  updateStrategy: (input: StrategyUpdateInput) => Promise<ApiResult<StrategyDetail>>;
  compileStrategySource: (sourceCode: string) => Promise<ApiResult<StrategyCompileResult>>;
  listStrategyVersions: (strategyId: string) => Promise<ApiResult<StrategyVersionSummary[]>>;
  deleteStrategy: (id: string) => Promise<ApiResult<void>>;
  getStrategyDts: () => Promise<string>;
  getDefaultStrategySource: () => Promise<string>;
  listBots: (params?: StrategyBotListParams) => Promise<ApiResult<StrategyBotListItem[]>>;
  createBot: (input: StrategyBotCreateInput) => Promise<ApiResult<StrategyBotDetail>>;
  updateBot: (input: StrategyBotUpdateInput) => Promise<ApiResult<StrategyBotDetail>>;
  deleteBot: (id: string) => Promise<ApiResult<void>>;
  startBot: (id: string) => Promise<ApiResult<StrategyBotDetail>>;
  stopBot: (id: string) => Promise<ApiResult<StrategyBotDetail>>;
  getBotActiveRun: (id: string) => Promise<ApiResult<StrategyRunDetail | null>>;
  listBotRuns: (botId: string, limit?: number) => Promise<ApiResult<StrategyRunListItem[]>>;
  getBotLogs: (runId: string, limit?: number) => Promise<ApiResult<StrategyRunLogEntry[]>>;
  getBotOrders: (runId: string, limit?: number) => Promise<ApiResult<StrategyRunOrderRecord[]>>;
  onBotRuntimeEvent: (callback: (event: StrategyBotRuntimeEvent) => void) => () => void;
  getActiveStrategyRun: (marketId: string) => Promise<ApiResult<StrategyRunDetail | null>>;
  listStrategyRunHistory: (
    params?: StrategyRunListParams,
  ) => Promise<ApiResult<StrategyRunListItem[]>>;
  getStrategyRunLogs: (runId: string, limit?: number) => Promise<ApiResult<StrategyRunLogEntry[]>>;
  getStrategyRunOrders: (
    runId: string,
    limit?: number,
  ) => Promise<ApiResult<StrategyRunOrderRecord[]>>;
  onStrategyRunEvent: (callback: (event: StrategyRunRuntimeEvent) => void) => () => void;
  getAppUpdateState: () => Promise<AppUpdateState>;
  installAppUpdate: () => Promise<boolean>;
  onAppUpdateStateChanged: (callback: (state: AppUpdateState) => void) => () => void;
  windowMinimize: () => Promise<void>;
  windowMaximize: () => Promise<void>;
  windowClose: () => Promise<void>;
  confirmMainWindowClose: () => Promise<void>;
  windowIsMaximized: () => Promise<boolean>;
  windowSetAlwaysOnTop: (pinned: boolean) => Promise<boolean>;
  windowIsAlwaysOnTop: () => Promise<boolean>;
  onWindowMaximizedChanged: (callback: (maximized: boolean) => void) => () => void;
  onMainWindowCloseRequested: (callback: () => void) => () => void;
  openBotManagement: () => Promise<void>;
  onMainWindowNavigate: (callback: (nav: string) => void) => () => void;
  openStrategyEditor: (input: StrategyEditorWindowInput) => Promise<void>;
  onStrategiesChanged: (callback: () => void) => () => void;
  openTradingWindow: (input: TradingWindowInput) => Promise<void>;
  onTradingWindowParams: (callback: (input: TradingWindowInput) => void) => () => void;
  onTradingWindowCloseBlocked: (callback: () => void) => () => void;
  updateTradingWindowMarketScope: (marketIds: string[]) => Promise<void>;
  confirmTradingWindowClose: () => Promise<void>;
  onTradingWindowCloseRequested: (callback: () => void) => () => void;
  tradingMarket: TradingMarketIpcApi;
  tradingStrategy: TradingStrategyIpcApi;
  openBrowserWindow: () => Promise<void>;
  browserNavigate: (
    url: string,
    options?: BrowserNavigateOptions,
  ) => Promise<ApiResult<BrowserNavigationState>>;
  browserGoBack: () => Promise<ApiResult<BrowserNavigationState>>;
  browserGoForward: () => Promise<ApiResult<BrowserNavigationState>>;
  browserReload: () => Promise<ApiResult<BrowserNavigationState>>;
  browserStop: () => Promise<ApiResult<BrowserNavigationState>>;
  browserGetState: () => Promise<ApiResult<BrowserNavigationState>>;
  browserDisconnectWallet: () => Promise<ApiResult<BrowserNavigationState>>;
  browserOpenConnectionDialog: () => Promise<ApiResult<void>>;
  browserSetViewBounds: (bounds: BrowserViewBounds) => Promise<ApiResult<void>>;
  browserModalGetPayload: () => Promise<ApiResult<BrowserModalPayload>>;
  browserModalRespondProviderRequest: (
    input: BrowserProviderResponseInput,
  ) => Promise<ApiResult<void>>;
  browserModalDisconnectWallet: () => Promise<ApiResult<BrowserNavigationState>>;
  browserModalClose: () => Promise<void>;
  onBrowserNavigationState: (callback: (state: BrowserNavigationState) => void) => () => void;
}

export type { AppUpdateState, AppUpdateStatus };
