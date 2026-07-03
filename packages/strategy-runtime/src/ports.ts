import type {
  StrategyPlaceOrderInput,
  StrategyRunOrderRecord,
  PolymarketWalletSummary,
  TradingAccountDataEvent,
  TradingAccountDataQuery,
  TradingMarketEvent,
  TradingMarketSubscribeOptions,
  TradingRuntimeAccountState,
  TradingMarketSnapshot,
  TradingWindowInput,
} from '@polytrader/shared';
import type { PolymarketWalletCredentials } from '@polytrader/polymarket-api';
import type { StrategyExecutorRuntimePaths } from '@polytrader/bot-runtime-contract';

interface StrategyRuntimeMarketSubscription {
  readonly marketId: string;
  onEvent(callback: (event: TradingMarketEvent) => void): () => void;
  unsubscribe(): void;
}

interface StrategyRuntimeMarketSubscribeResult {
  subscription: StrategyRuntimeMarketSubscription;
  snapshot: TradingMarketSnapshot;
}

interface StrategyRuntimeMarketPort {
  subscribe(
    input: TradingWindowInput,
    options?: TradingMarketSubscribeOptions,
  ): Promise<StrategyRuntimeMarketSubscribeResult>;
  getSnapshot(marketId: string): TradingMarketSnapshot | null;
  loadMarketDetail(marketId: string): Promise<TradingMarketSnapshot>;
  loadPriceHistory(
    marketId: string,
    interval?: string,
    fidelity?: number,
  ): Promise<TradingMarketSnapshot>;
  loadTrades(marketId: string): Promise<TradingMarketSnapshot>;
}

interface StrategyRuntimeAccountPort {
  getCredential(walletId: string): Promise<PolymarketWalletCredentials>;
  getSummary(walletId: string): Promise<PolymarketWalletSummary>;
  queryAccount(query?: TradingAccountDataQuery): Promise<TradingRuntimeAccountState>;
  syncAccountNow(walletId: string): Promise<void>;
  onDataEvent(callback: (event: TradingAccountDataEvent) => void): () => void;
}

interface StrategyRuntimeExecutorPort {
  getRuntimePaths(): StrategyExecutorRuntimePaths;
}

interface StrategyRuntimeOrderPort {
  placeStrategyOrder(input: {
    orderId?: string;
    walletId: string;
    runId: string;
    strategyId: string;
    strategyVersion: number;
    marketId: string;
    order: StrategyPlaceOrderInput;
    onOrderRecord?: (record: StrategyRunOrderRecord) => void;
  }): Promise<unknown>;
  cancelOrder(input: { walletId: string; exchangeOrderId: string }): Promise<unknown>;
  cancelAllOrders(input: { walletId: string }): Promise<unknown>;
}

interface StrategyRuntimePorts {
  marketRuntime: StrategyRuntimeMarketPort;
  accounts: StrategyRuntimeAccountPort;
  executor: StrategyRuntimeExecutorPort;
  orders: StrategyRuntimeOrderPort;
}

export type {
  StrategyRuntimeAccountPort,
  StrategyRuntimeExecutorPort,
  StrategyRuntimeMarketPort,
  StrategyRuntimeMarketSubscribeResult,
  StrategyRuntimeMarketSubscription,
  StrategyRuntimeOrderPort,
  StrategyRuntimePorts,
};
