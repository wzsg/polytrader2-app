import type {
  MarketTradeAnalysisResult,
  MarketTradeListResult,
  MarketTradeSyncStatus,
  MarketTradeTick,
} from './marketTrade.js';
import type {
  StrategyRunDetail,
  StrategyRunListItem,
  StrategyRunLogEntry,
  StrategyRunOrderRecord,
} from './strategy.js';
import type { SortOrder } from './common.js';
import type { AccountOrderStatus } from './tradingOrder.js';

export type EventStatusFilter = 'all' | 'active' | 'closed';
export type SyncState = 'idle' | 'syncing' | 'finalizing' | 'done' | 'aborted' | 'error';
type EventSyncTrigger = 'startup' | 'schedule' | 'manual' | 'retry' | 'locale-change';
export type AuthProvider = 'google' | 'github';
export type AuthStatus = 'disabled' | 'signed-out' | 'signed-in' | 'error';
export type UserSyncState = 'idle' | 'syncing' | 'synced' | 'error';

export interface AuthUserSummary {
  id: string;
  email: string | null;
}

export interface AuthState {
  configured: boolean;
  status: AuthStatus;
  user: AuthUserSummary | null;
  email: string | null;
  syncState: UserSyncState;
  error: string | null;
}

export interface AuthEmailInput {
  email: string;
  password: string;
  captchaToken?: string;
}

export interface AuthProviderStartResult {
  provider: AuthProvider;
}

export interface UserSyncResult {
  preferenceSynced: boolean;
  watchlistSynced: boolean;
  watchlistActiveCount: number;
  watchlistDeletedCount: number;
}

export interface SyncStatus {
  state: SyncState;
  page?: number;
  completedEvents?: number;
  totalEvents?: number;
  progressPercent?: number;
  error?: string;
}

export interface SyncScheduleConfig {
  enabled: boolean;
  intervalMinutes: number;
}

export interface SetupDirectorySelectionResult {
  canceled: boolean;
  dataDirectory: string | null;
}

export interface SetupState {
  setupCompleted: boolean;
  dataDirectory: string | null;
  defaultDataDirectory: string;
  localePreference: 'system' | 'en-US' | 'zh-CN';
  systemLocale: string;
  encryptionMethod: 'keychain' | 'dpapi' | 'aes-256-gcm' | null;
  encryptionLocked: boolean;
  requiresPassword: boolean;
  availableSpaceBytes: number | null;
  hasExistingDatabase: boolean;
  cacheStats?: CacheStats;
  syncStatus?: SyncStatus;
}

export interface McpServerConfig {
  enabled: boolean;
  port: number;
  token: string;
}

export interface McpServerStatus {
  enabled: boolean;
  running: boolean;
  host: string;
  port: number;
  endpoint: string;
  tokenConfigured: boolean;
  error: string | null;
}

export interface DeveloperModeConfig {
  enabled: boolean;
}

export interface McpServerAccessLogRecord {
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

export interface DeveloperOrderRecord {
  walletId: string;
  orderId: string;
  conditionId: string;
  marketId: string | null;
  eventId: string | null;
  exchangeOrderId: string | null;
  active: boolean;
  status: AccountOrderStatus;
  orderType: string | null;
  side: string | null;
  assetId: string | null;
  outcome: string | null;
  price: string | null;
  shares: string | null;
  sizeMatched: string | null;
  amount: string | null;
  createdAt: number | null;
  inputJson: string | null;
  requestJson: string | null;
  responseJson: string | null;
  errorMessage: string | null;
  owner: string | null;
  makerAddress: string | null;
  expiration: string | null;
  associateTradesJson: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  updatedAt: string;
}

export interface Filters {
  search: string;
  volume24hrMin: string;
  volume24hrMax: string;
  volumeMin: string;
  volumeMax: string;
  liquidityMin: string;
  liquidityMax: string;
  marketCountMin: string;
  marketCountMax: string;
  endDateMin: string;
  endDateMax: string;
  status: EventStatusFilter;
  eventStatus?: EventStatusFilter;
  watchlistStatus?: EventStatusFilter;
  eventCategorySlug?: string;
  sortField: string;
  sortOrder: SortOrder;
  eventSortField?: string;
  eventSortOrder?: SortOrder;
  watchlistSortField?: string;
  watchlistSortOrder?: SortOrder;
  cryptoSortField?: string;
  cryptoSortOrder?: SortOrder;
  cryptoCoin?: string;
  cryptoMarketMode?: string;
  cryptoTimeframe?: string;
  cryptoStatus?: EventStatusFilter;
  cryptoEndDateMin?: string;
  cryptoEndDateMax?: string;
  sportsDiscipline?: string;
  sportsSport?: string;
  sportsSearch?: string;
  sportsSortField?: string;
  sportsSortOrder?: SortOrder;
  esportsSport?: string;
  esportsSearch?: string;
  esportsSortField?: string;
  esportsSortOrder?: SortOrder;
}

export interface ListEventsParams {
  search?: string;
  volume24hrMin?: string | number;
  volume24hrMax?: string | number;
  volumeMin?: string | number;
  volumeMax?: string | number;
  liquidityMin?: string | number;
  liquidityMax?: string | number;
  marketCountMin?: string | number;
  marketCountMax?: string | number;
  endDateMin?: string;
  endDateMax?: string;
  endDateAfter?: string;
  activeEndDateAfter?: string;
  startTimeAfter?: string;
  status?: EventStatusFilter;
  excludeEnded?: boolean;
  sportId?: string;
  sportIds?: string[];
  requireSportId?: boolean;
  tagIds?: string[];
  excludeTagIds?: string[];
  watchlistOnly?: boolean;
  includeChildEvents?: boolean;
  sortField?: string;
  sortOrder?: SortOrder;
  limit?: number;
  offset?: number;
}

export interface MarketSummary {
  id: string;
  active: boolean;
  closed: boolean;
}

export interface DbMarket {
  id: string;
  question: string;
  slug: string;
  groupItemTitle: string;
  conditionId: string | null;
  image: string;
  icon: string;
  active: boolean;
  closed: boolean;
  negRisk: boolean;
  outcomes: string | null;
  outcomePrices: string | null;
  clobTokenIds: string | null;
  clobTokenIds0: string | null;
  clobTokenIds1: string | null;
  outcomes0: string | null;
  outcomes1: string | null;
  outcomePrices0: string | null;
  outcomePrices1: string | null;
  volume?: number;
  volume24hr?: number;
  liquidity?: number;
}

export interface EventListItem {
  id: string;
  title: string;
  slug: string;
  image: string;
  volume: number;
  volume24hr: number;
  liquidity: number;
  active: boolean;
  closed: boolean;
  ended: boolean;
  market_count: number;
  start_date: string | null;
  start_time: string | null;
  end_date: string | null;
  category: string;
  sportId?: string | null;
  featured: boolean;
  parentEventId: string | null;
  teams: string | null;
}

export interface EventDetailItem extends EventListItem {
  markets: DbMarket[] | MarketSummary[];
}

export interface Market {
  id: string;
  question: string;
  slug: string;
  groupItemTitle: string;
  image: string;
  icon: string;
  active: boolean;
  closed: boolean;
  negRisk: boolean;
  conditionId: string;
  clobTokenIds: string[];
  outcomes: unknown[];
  outcomePrices: unknown[];
  enableOrderBook: boolean;
  orderPriceMinTickSize: string | null;
  orderMinSize: string | null;
  volume: number;
  volume24hr: number;
  liquidity: number;
  endDate?: string | null;
}

export interface ApiEvent {
  id: string;
  title: string;
  slug: string;
  image: string;
  icon: string;
  volume: number;
  volume24hr: number;
  liquidity: number;
  active: boolean;
  closed: boolean;
  start_date: string | null;
  end_date: string | null;
  featured: boolean;
  parentEventId: string | null;
  teams: EventTeam[];
  description: string;
  markets: Market[];
}

export interface EventTeam {
  name: string;
  logo: string;
  abbreviation?: string;
  ordering?: string;
  color?: string;
}

export interface MarketOutcome {
  tokenId: string;
  label: string;
  price: unknown;
  tickSize: string | null;
  minOrderSize: string | null;
}

export interface HolderEntry {
  proxyWallet?: string;
  amount?: number;
  name?: string;
  pseudonym?: string;
  [key: string]: unknown;
}

export interface HolderGroup {
  tokenId: string;
  label: string;
  holders: HolderEntry[];
}

export interface MarketDetailData {
  market: Market;
  outcomes: MarketOutcome[];
  holders: HolderGroup[];
}

export interface CacheStats {
  eventCount: number;
  marketCount: number;
  lastSyncAt: string | null;
}

export interface CryptoEventsResult {
  events: EventListItem[];
  filteredCount: number;
  totalCount: number;
  activeCount: number;
}

export type SportsEventScope = 'sports' | 'esports';

export interface SportsMetadataRaw {
  id?: number;
  sport: string;
  image: string;
  resolution: string;
  ordering: string;
  tags: string;
  series: string;
  createdAt?: string;
}

export interface SportsMetadataItem {
  id?: number;
  sport: string;
  name?: string;
  defaultName?: string;
  disciplineCode?: string;
  disciplineName?: string;
  image: string;
  resolution: string;
  ordering: string;
  tagIds: string[];
  series: string;
  activeEventCount?: number;
  createdAt?: string;
}

export type SportsCategoryInclude = 'active' | 'all';

export interface SportLeagueCategory {
  id: string;
  code: string;
  name: string;
  shortName: string;
  defaultName: string;
  image: string | null;
  resolution: string | null;
  ordering: string | null;
  openEventCount: number;
}

export interface SportDisciplineCategory {
  code: string;
  name: string;
  defaultName: string;
  icon: string | null;
  sortOrder: number;
  openEventCount: number;
  leagues: SportLeagueCategory[];
}

export interface SportsCategoryConfig {
  locale: string;
  include: SportsCategoryInclude;
  generatedAt: string;
  disciplines: SportDisciplineCategory[];
}

export interface SportsEventsResult {
  events: EventListItem[];
  filteredCount: number;
  totalCount: number;
  activeCount: number;
}

export interface CryptoCategoryItem {
  id?: string;
  slug: string;
  enabled?: boolean;
  sortOrder?: number;
  tagIds?: Array<string | number>;
  startTimeMinutes?: number;
  labels?: Record<string, string>;
  symbol?: string;
  iconUrl?: string;
  marketModes?: CryptoCategoryItem[];
  timeframes?: CryptoCategoryItem[];
}

export interface CryptoCategoryConfig {
  coins: CryptoCategoryItem[];
}

export interface EventCategoryItem {
  slug: string;
  enabled?: boolean;
  sortOrder?: number;
  locale?: string[];
  tagIds?: Array<string | number>;
  excludeTagIds?: Array<string | number>;
  labels?: Record<string, string>;
}

export interface EventCategoryConfig {
  categories: EventCategoryItem[];
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface ClobStatus {
  credentialsConfigured: boolean;
  positionsConfigured: boolean;
}

export interface BalanceAllowance {
  walletAddress: string | null;
  balance: string;
  balanceUsd: string;
  allowances: Array<{
    address: string;
    label: string;
    raw: string;
    formatted: string;
  }>;
}

export interface OrderBookLevel {
  price: string;
  size: string;
}

export interface OrderBook {
  tokenId: string;
  label: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  tickSize: string | null;
  minOrderSize: string | null;
  lastTradePrice: string | null;
  lastTradeSide: string | null;
  lastTradePriceRaw: string | null;
  unavailable: boolean;
}

export interface PriceHistoryPoint {
  t: number;
  p: number;
}

export interface WsBookEvent {
  event_type: 'book';
  asset_id: string;
  bids?: OrderBookLevel[];
  asks?: OrderBookLevel[];
  tick_size?: string;
  min_order_size?: string;
  last_trade_price?: string;
  last_trade_side?: string;
}

export interface WsPriceChange {
  asset_id: string;
  side: string;
  price: string;
  size: string;
}

export interface WsPriceChangeEvent {
  event_type: 'price_change';
  price_changes?: WsPriceChange[];
}

export interface WsLastTradeEvent {
  event_type: 'last_trade_price';
  asset_id: string;
  price: string;
  side?: string;
  size?: string;
  timestamp?: string;
  fee_rate_bps?: string;
  market?: string;
}

export interface WsTickSizeEvent {
  event_type: 'tick_size_change';
  asset_id: string;
  new_tick_size?: string;
}

export type WsMessage = WsBookEvent | WsPriceChangeEvent | WsLastTradeEvent | WsTickSizeEvent;

export interface GammaEventRaw {
  id: string | number;
  title?: string;
  slug?: string;
  image?: string;
  icon?: string;
  volume?: number | string;
  volume24hr?: number | string;
  liquidity?: number | string;
  active?: boolean;
  closed?: boolean;
  ended?: boolean;
  startDate?: string | null;
  startTime?: string | null;
  endDate?: string | null;
  category?: string;
  sportId?: string | number | null;
  sport?: {
    id?: string | number | null;
  } | null;
  featured?: boolean;
  parentEventId?: string | number | null;
  teams?: unknown;
  updatedAt?: string | null;
  description?: string;
  markets?: GammaMarketRaw[];
  tags?: Array<{ id: string | number; label?: string; slug?: string }>;
}

export interface GammaMarketRaw {
  id: string | number;
  question?: string;
  slug?: string;
  groupItemTitle?: string;
  image?: string;
  icon?: string;
  active?: boolean;
  closed?: boolean;
  negRisk?: boolean;
  negRiskMarketID?: string | null;
  negRiskRequestID?: string | null;
  negRiskOther?: boolean;
  conditionId?: string;
  clobTokenIds?: unknown;
  outcomes?: unknown;
  outcomePrices?: unknown;
  enableOrderBook?: boolean;
  orderPriceMinTickSize?: number | string | null;
  orderMinSize?: number | string | null;
  volume?: number | string;
  volumeNum?: number | string;
  volume24hr?: number | string;
  liquidity?: number | string;
  liquidityNum?: number | string;
  endDate?: string | null;
  updatedAt?: string | null;
}

export interface HolderApiGroup {
  token: string;
  holders?: HolderEntry[];
}

export interface ClobOrder {
  id: string;
  wallet_id?: string;
  order_id?: string;
  exchange_order_id?: string | null;
  market_id?: string;
  event_id?: string;
  event_title?: string;
  event_icon?: string;
  market_title?: string;
  market_icon?: string;
  status?: AccountOrderStatus;
  error_message?: string;
  side?: string;
  asset_id?: string;
  token_id?: string;
  market?: string;
  condition_id?: string;
  price?: string | number;
  original_size?: string | number;
  size_matched?: string | number;
  amount?: string | number;
  order_type?: string;
  outcome?: string;
  created_at?: string | number;
  owner?: string;
  maker_address?: string;
  expiration?: string | number;
  associate_trades?: string[];
}

export interface ClobTradeMakerOrder {
  order_id?: string;
  owner?: string;
  maker_address?: string;
  matched_amount?: string | number;
  price?: string | number;
  fee_rate_bps?: string | number;
  asset_id?: string;
  outcome?: string;
  side?: string;
}

export interface ClobTrade {
  id?: string;
  market_id?: string;
  event_id?: string;
  event_title?: string;
  event_icon?: string;
  market_title?: string;
  market_icon?: string;
  taker_order_id?: string;
  conditionId?: string;
  condition_id?: string;
  market?: string;
  asset_id?: string;
  side?: string;
  price?: string | number;
  size?: string | number;
  fee_rate_bps?: string | number;
  status?: string;
  outcome?: string;
  match_time?: string | number;
  last_update?: string | number;
  bucket_index?: number;
  owner?: string;
  maker_address?: string;
  transaction_hash?: string;
  trader_side?: string;
  maker_orders?: ClobTradeMakerOrder[];
}

export interface DataPosition {
  market_id?: string;
  event_id?: string;
  event_title?: string;
  event_icon?: string;
  market_title?: string;
  market_icon?: string;
  proxyWallet?: string;
  asset?: string;
  conditionId?: string;
  size?: number;
  avgPrice?: number;
  initialValue?: number;
  currentValue?: number;
  cashPnl?: number;
  percentPnl?: number;
  totalBought?: number;
  realizedPnl?: number;
  percentRealizedPnl?: number;
  curPrice?: number;
  redeemable?: boolean;
  mergeable?: boolean;
  title?: string;
  slug?: string;
  icon?: string;
  eventSlug?: string;
  outcome?: string;
  outcomeIndex?: number;
  oppositeOutcome?: string;
  oppositeAsset?: string;
  endDate?: string;
  negativeRisk?: boolean;
}

export type PolymarketWalletCreationType = 'created' | 'imported';
export type PolymarketWalletWalletKeyMaterialType =
  | 'private_key'
  | 'mnemonic_seed'
  | 'derived_wallet';
export type PolymarketWalletInitializationStatus =
  | 'pending'
  | 'deriving_credentials'
  | 'deploying_deposit_wallet'
  | 'approving_polymarket'
  | 'ready'
  | 'failed';
const POLYMARKET_WALLET_LIMIT = 30 as const;

export interface PolymarketWalletSummary {
  id: string;
  name: string;
  creationType: PolymarketWalletCreationType;
  walletKeyMaterialType: PolymarketWalletWalletKeyMaterialType;
  parentWalletId: string | null;
  derivationPath: string | null;
  walletAddress: string;
  credentialsConfigured: boolean;
  apiKeyMasked: string;
  secretMasked: string;
  passphraseMasked: string;
  depositWalletAddress: string;
  balance: BalanceAllowance | null;
  positionsTotalValue: number | null;
  positionsInitialValue: number | null;
  relayerApiKeyMasked: string;
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

export type PolymarketWalletKeyMaterialRevealType = 'private_key' | 'mnemonic';

export interface PolymarketWalletKeyMaterialReveal {
  walletId: string;
  type: PolymarketWalletKeyMaterialRevealType;
  value: string;
}

export type PolymarketWalletEventType = 'created' | 'updated' | 'deleted' | 'default-changed';

export interface PolymarketWalletEvent {
  type: PolymarketWalletEventType;
  wallet: PolymarketWalletSummary;
  previousWallet?: PolymarketWalletSummary;
  previousDefaultWalletId?: string | null;
}

export interface PolymarketWalletImportInput {
  name: string;
  walletKeyMaterialType?: PolymarketWalletWalletKeyMaterialType;
  privateKey?: string;
  mnemonic?: string;
  apiKey?: string;
  secret?: string;
  passphrase?: string;
  depositWalletAddress?: string;
  relayerApiKey?: string;
  signatureType?: number;
  chainId?: number;
  clobHost?: string;
  isDefault?: boolean;
}

export interface PolymarketWalletUpdateInput {
  id: string;
  name?: string;
  relayerApiKey?: string;
  isDefault?: boolean;
}

export interface PolymarketWalletCreateInput {
  name: string;
  walletKeyMaterialType?: PolymarketWalletWalletKeyMaterialType;
  isDefault?: boolean;
  nonce?: number;
}

export interface PolymarketWalletDerivedInput {
  parentWalletId: string;
  name: string;
  isDefault?: boolean;
  nonce?: number;
}

export interface PolymarketAccountCredentialDerivationInput {
  privateKey: string;
  nonce?: number;
  chainId?: number;
  clobHost?: string;
  relayerUrl?: string;
}

export interface PolymarketAccountCredentialDerivationResult {
  walletAddress: string;
  apiKey: string;
  secret: string;
  passphrase: string;
  depositWalletAddress: string;
  signatureType: number;
  chainId: number;
  clobHost: string;
}

export type WorkflowTaskStatus =
  | 'pending'
  | 'running'
  | 'retry_scheduled'
  | 'succeeded'
  | 'failed'
  | 'canceled';

export interface WorkflowTaskRecord {
  id: string;
  type: string;
  groupKey: string;
  status: WorkflowTaskStatus;
  payloadJson: string;
  resultJson: string | null;
  errorMessage: string | null;
  attemptCount: number;
  maxAttempts: number;
  nextRunAt: string | null;
  lockedAt: string | null;
  lockedBy: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TradingWindowInput {
  eventId: string;
  marketId: string;
  tokenId?: string | null;
  outcome?: string | null;
  metadata?: unknown;
}

export interface TradingMarketSubscribeOptions {
  startOrderBook?: boolean;
  startMarketTradeSync?: boolean;
  loadStrategy?: boolean;
  loadPriceHistory?: boolean;
}

export type TradingRuntimeLoadScope =
  | 'gammaEvent'
  | 'marketDetail'
  | 'orderBook'
  | 'priceHistory'
  | 'marketTrades';

export type TradingRuntimeConnectionStatus = 'idle' | 'loading' | 'ready' | 'error';
export type TradingRuntimeWsStatus = 'disconnected' | 'connecting' | 'live' | 'error';

export interface TradingRuntimeAccountState {
  accounts: PolymarketWalletSummary[];
  selectedWalletId: string;
  credentialsConfigured: boolean;
  positionsConfigured: boolean;
  balance: BalanceAllowance | null;
  orders: ClobOrder[];
  positions: DataPosition[];
  trades: ClobTrade[];
  error: string;
  updatedAt: string | null;
}

interface TradingAccountDataQuery {
  walletId?: string;
  conditionId?: string;
  includeBalance?: boolean;
  limit?: number;
  offset?: number;
}

type TradingAccountDataEvent =
  | {
      type: 'balance-changed';
      walletId: string;
      reason: string;
      balance: BalanceAllowance;
      at: string;
    }
  | {
      type: 'orders-changed';
      walletId: string;
      reason: string;
      at: string;
    }
  | {
      type: 'positions-changed';
      walletId: string;
      reason: string;
      at: string;
    }
  | {
      type: 'position-summary-changed';
      walletId: string;
      reason: string;
      positionsTotalValue: number | null;
      positionsInitialValue: number | null;
      at: string;
    }
  | {
      type: 'trades-changed';
      walletId: string;
      reason: string;
      at: string;
    };

export interface TradingStrategyState {
  marketId: string;
  activeRun: StrategyRunDetail | null;
  history: StrategyRunListItem[];
  logs: StrategyRunLogEntry[];
  orders: StrategyRunOrderRecord[];
  selectedRunId: string;
  error: string;
  updatedAt: string | null;
}

export interface TradingStrategyStateEvent {
  marketId: string;
  strategy: TradingStrategyState;
}

export interface TradingRuntimeMarketTradeState {
  syncStatus: MarketTradeSyncStatus | null;
  recent: MarketTradeListResult | null;
  analysis: MarketTradeAnalysisResult | null;
  error: string;
  updatedAt: string | null;
}

export interface CryptoTick {
  source: 'chainlink';
  symbol: string;
  rawSymbol: string;
  price: number;
  eventTime: string;
  wsTime: string;
  ingestedAt: string;
  dedupKey: string;
}

export type TradingRuntimeCryptoTickStatus = 'idle' | 'loading' | 'live' | 'closed' | 'error';

export interface TradingRuntimeCryptoTickState {
  enabled: boolean;
  source: 'chainlink';
  symbol: string;
  status: TradingRuntimeCryptoTickStatus;
  referenceStartTime: string | null;
  referenceEndTime: string | null;
  displayStartTime: string | null;
  displayEndTime: string | null;
  ticks: CryptoTick[];
  latestTick: CryptoTick | null;
  error: string;
  updatedAt: string | null;
}

type BinanceKlineVenue = 'spot' | 'usdm-futures';

interface BinanceKline {
  source: 'binance';
  venue: BinanceKlineVenue;
  symbol: string;
  interval: '1m' | '1h';
  openTime: string;
  closeTime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closed: boolean;
}

interface BinanceTradeTick {
  source: 'binance';
  venue: BinanceKlineVenue;
  symbol: string;
  price: string;
  quantity: string;
  tradeTime: string;
}

interface TradingRuntimeBinanceKlineState {
  enabled: boolean;
  source: 'binance';
  venue: BinanceKlineVenue;
  symbol: string;
  status: TradingRuntimeCryptoTickStatus;
  referenceStartTime: string | null;
  referenceEndTime: string | null;
  candles: BinanceKline[];
  referenceCandle: BinanceKline | null;
  latestTrade: BinanceTradeTick | null;
  error: string;
  updatedAt: string | null;
}

export interface TradingMarketSnapshot {
  marketId: string;
  eventId: string;
  selectedTokenId: string;
  selectedOutcome: string | null;
  metadata?: unknown;
  status: Record<TradingRuntimeLoadScope, TradingRuntimeConnectionStatus>;
  errors: Partial<Record<TradingRuntimeLoadScope, string>>;
  event: GammaEventRaw | null;
  marketDetail: MarketDetailData | null;
  orderBooks: OrderBook[];
  recentLiveTrades: MarketTradeTick[];
  wsStatus: TradingRuntimeWsStatus;
  priceHistory: Record<string, PriceHistoryPoint[]>;
  cryptoTick: TradingRuntimeCryptoTickState | null;
  binanceKline: TradingRuntimeBinanceKlineState | null;
  marketTrades: TradingRuntimeMarketTradeState;
  updatedAt: string | null;
}

export interface TradingMarketSnapshotEvent {
  marketId: string;
  snapshot: TradingMarketSnapshot;
}

export interface TradingMarketStatusEvent {
  marketId: string;
  scope: TradingRuntimeLoadScope;
  status: TradingRuntimeConnectionStatus;
  error?: string;
}

export interface TradingMarketGammaEvent {
  marketId: string;
  event: GammaEventRaw | null;
}

export interface TradingMarketDetailEvent {
  marketId: string;
  data: MarketDetailData | null;
}

export interface TradingMarketOrderBookEvent {
  marketId: string;
  orderBooks: OrderBook[];
  recentLiveTrades: MarketTradeTick[];
  wsStatus: TradingRuntimeWsStatus;
}

export interface TradingMarketPriceHistoryEvent {
  marketId: string;
  priceHistory: Record<string, PriceHistoryPoint[]>;
}

export interface TradingMarketPriceHistoryUpdatedEvent {
  marketId: string;
  interval: string;
  fidelity: number;
  pointsByToken: Record<string, PriceHistoryPoint[]>;
}

export interface TradingMarketTradesEvent {
  marketId: string;
  marketTrades: TradingRuntimeMarketTradeState;
}

export interface TradingMarketCryptoTickEvent {
  marketId: string;
  cryptoTick: TradingRuntimeCryptoTickState | null;
}

interface TradingMarketBinanceKlineEvent {
  marketId: string;
  binanceKline: TradingRuntimeBinanceKlineState | null;
}

export interface TradingMarketEventMap {
  'runtime-snapshot': TradingMarketSnapshotEvent;
  'runtime-status': TradingMarketStatusEvent;
  'gamma-event': TradingMarketGammaEvent;
  'market-detail': TradingMarketDetailEvent;
  'order-book': TradingMarketOrderBookEvent;
  'price-history-loaded': TradingMarketPriceHistoryEvent;
  'price-history-updated': TradingMarketPriceHistoryUpdatedEvent;
  'market-trades-state': TradingMarketTradesEvent;
  'crypto-tick': TradingMarketCryptoTickEvent;
  'binance-kline': TradingMarketBinanceKlineEvent;
}

export type TradingMarketEventName = keyof TradingMarketEventMap & string;

export type TradingMarketEventPayload = TradingMarketEventMap[keyof TradingMarketEventMap & string];

export type TradingMarketEvent<EventName extends TradingMarketEventName = TradingMarketEventName> =
  {
    [Name in EventName]: {
      eventName: Name;
      event: TradingMarketEventMap[Name];
    };
  }[EventName];

export interface BrowserNavigationState {
  url: string;
  title: string;
  faviconUrl?: string | null;
  walletConnection: BrowserWalletConnectionState;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  error?: string | null;
}

export interface BrowserNavigateOptions {
  preferredAccountId?: string;
}

export interface BrowserViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type BrowserProviderRequestKind = 'connect' | 'sign' | 'transaction';

export interface BrowserProviderAccount {
  id: string;
  name: string;
  walletAddress: string;
  chainId: number;
  isDefault: boolean;
}

export interface BrowserWalletConnectionState {
  connected: boolean;
  accounts: BrowserProviderAccount[];
}

export interface BrowserProviderRequest {
  id: string;
  origin: string;
  url: string;
  method: string;
  kind: BrowserProviderRequestKind;
  accounts: BrowserProviderAccount[];
  walletId?: string;
  walletName?: string;
  accountAddress?: string;
  message?: string;
  transactionPreview?: BrowserProviderTransactionPreview;
  rawParams?: unknown;
}

export interface BrowserProviderTransactionPreview {
  kind: 'erc20-transfer' | 'erc20-approve' | 'contract-call' | 'native-transfer';
  tokenAddress?: string;
  tokenName?: string;
  tokenSymbol?: string;
  tokenDecimals?: number;
  actionLabel: string;
  amountRaw?: string;
  amountFormatted?: string;
  from?: string;
  to?: string;
  spender?: string;
  contractAddress?: string;
  nativeValueFormatted?: string;
  method?: string;
}

export interface BrowserProviderResponseInput {
  id: string;
  approved: boolean;
  walletId?: string;
}

export interface BrowserProviderRequestModalPayload {
  kind: 'provider-request';
  request: BrowserProviderRequest;
}

export interface BrowserConnectionModalPayload {
  kind: 'connection-management';
  origin: string;
  walletConnection: BrowserWalletConnectionState;
}

export type BrowserModalPayload =
  | BrowserProviderRequestModalPayload
  | BrowserConnectionModalPayload;

export type {
  MarketTradeAnalysisBucket,
  MarketTradeAnalysisBreakdown,
  MarketTradeAnalysisPoint,
  MarketTradeAnalysisQuery,
  MarketTradeAnalysisResult,
  MarketTradeAnalysisSummary,
  MarketTradeListResult,
  MarketTradeQuery,
  MarketTradeSortField,
  MarketTradeSyncState,
  MarketTradeSyncStatus,
  MarketTradeTick,
} from './marketTrade.js';

export type {
  StrategyBotCreateInput,
  StrategyBotDetail,
  StrategyBotListItem,
  StrategyBotListParams,
  StrategyBotRuntimeEvent,
  StrategyBotStatus,
  StrategyBotUpdateInput,
  StrategyCompileResult,
  StrategyCompileStatus,
  StrategyCreateInput,
  StrategyDetail,
  StrategyEditorWindowInput,
  StrategyLimitOrderInput,
  StrategyListItem,
  StrategyLogLevel,
  StrategyMarketOrderInput,
  StrategyOrderSide,
  StrategyPlaceOrderInput,
  StrategyRunDetail,
  StrategyRunListItem,
  StrategyRunListParams,
  StrategyRunLogEntry,
  StrategyRunOrderRecord,
  StrategyRunRuntimeEvent,
  StrategyRunStatus,
  StrategyUpdateInput,
  StrategyVersionSummary,
} from './strategy.js';

export type { SortOrder } from './common.js';
export type {
  PolymarketBridgeAddressResponse,
  PolymarketBridgeAddressSet,
  PolymarketBridgeChain,
  PolymarketBridgeDepositInput,
  PolymarketBridgeFeeBreakdown,
  PolymarketBridgeQuoteInput,
  PolymarketBridgeQuoteResponse,
  PolymarketBridgeSupportedAsset,
  PolymarketBridgeSupportedAssetsResponse,
  PolymarketBridgeToken,
  PolymarketBridgeTransaction,
  PolymarketBridgeTransactionStatus,
  PolymarketBridgeTransactionStatusResponse,
  PolymarketBridgeWithdrawalInput,
  PolymarketBridgeWithdrawalEvent,
  PolymarketBridgeWithdrawalEventType,
  PolymarketBridgeWithdrawalRecord,
  PolymarketBridgeWithdrawalResult,
  PolymarketBridgeWithdrawalStatus,
  PolymarketBridgeWithdrawalSubmitResult,
} from './polymarketBridge.js';
export type {
  AccountOrderCreateInput,
  AccountOrderExchangeUpdateInput,
  AccountOrderStatus,
  AccountOrderUpdateInput,
  ManualPlaceOrderInput,
} from './tradingOrder.js';
export type {
  TradingAccountPositionAmountInput,
  TradingAccountPositionMergeInput,
  TradingAccountPositionOperationResult,
  TradingAccountPositionRedeemInput,
  TradingAccountPositionSplitInput,
} from './tradingPosition.js';

export type {
  BinanceKline,
  BinanceKlineVenue,
  BinanceTradeTick,
  EventSyncTrigger,
  TradingAccountDataEvent,
  TradingAccountDataQuery,
  TradingMarketBinanceKlineEvent,
  TradingRuntimeBinanceKlineState,
};

export { POLYMARKET_WALLET_LIMIT };
