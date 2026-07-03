import type {
  GammaEventRaw,
  MarketDetailData,
  MarketTradeAnalysisQuery,
  MarketTradeAnalysisResult,
  MarketTradeListResult,
  MarketTradeQuery,
  TradingMarketEvent,
  TradingMarketSubscribeOptions,
  TradingMarketSnapshot,
  TradingWindowInput,
} from '@polytrader/shared';
import type { OrderBookWebSocketClient } from './order-book/index.js';
import type {
  TradingMarketPriceHistoryApiClient,
  TradingMarketPriceHistoryRepositoryFactory,
} from './price-history/index.js';
import type {
  TradingMarketRuntimeTradeSync,
  TradingMarketTradeRepositoryFactory,
} from './trade/tradingMarketTradeService.js';

interface TradingMarketRuntimeApiClient extends TradingMarketPriceHistoryApiClient {
  fetchEventById(eventId: string): Promise<GammaEventRaw>;
  fetchMarketDetail(marketId: string): Promise<MarketDetailData>;
}

interface TradingMarketServiceOptions {
  apiClient: TradingMarketRuntimeApiClient;
  marketTradeRepositoryFactory: TradingMarketTradeRepositoryFactory;
  marketPriceHistoryRepositoryFactory: TradingMarketPriceHistoryRepositoryFactory;
  marketTradeSync: TradingMarketRuntimeTradeSync;
  orderbookFactory?: (marketId: string) => OrderBookWebSocketClient;
  cleanupDelayMs?: number;
}

interface TradingMarketRuntime {
  readonly marketId: string;
  snapshot(): TradingMarketSnapshot;
  loadMarketDetail(): Promise<TradingMarketSnapshot>;
  selectToken(tokenId: string, outcome?: string | null): TradingMarketSnapshot;
  loadPriceHistory(interval?: string, fidelity?: number): Promise<TradingMarketSnapshot>;
  loadTrades(): Promise<TradingMarketSnapshot>;
  listMarketTrades(query: MarketTradeQuery): Promise<MarketTradeListResult>;
  getMarketTradeAnalysis(query: MarketTradeAnalysisQuery): Promise<MarketTradeAnalysisResult>;
  onEvent(callback: (event: TradingMarketEvent) => void): () => void;
}

interface TradingMarketSubscription {
  readonly id: string;
  readonly marketId: string;
  readonly market: TradingMarketRuntime;
  readonly closed: boolean;
  onEvent(callback: (event: TradingMarketEvent) => void): () => void;
  unsubscribe(): void;
}

interface TradingMarketSubscribeResult {
  subscription: TradingMarketSubscription;
  snapshot: TradingMarketSnapshot;
}

interface TradingMarketService {
  subscribe(
    input: TradingWindowInput,
    options?: TradingMarketSubscribeOptions,
  ): Promise<TradingMarketSubscribeResult>;
  getMarket(marketId: string): TradingMarketRuntime | null;
  getSnapshot(marketId: string): TradingMarketSnapshot | null;
  disposeMarket(marketId: string): void;
  disposeAll(): void;
  dispose(): void;
}

export type {
  TradingMarketRuntimeApiClient,
  TradingMarketRuntime,
  TradingMarketService,
  TradingMarketServiceOptions,
  TradingMarketSubscribeResult,
  TradingMarketSubscription,
};
