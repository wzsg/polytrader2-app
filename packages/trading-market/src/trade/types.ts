import type { MarketTradeRepository } from '@polytrader/repository-contract';
import type {
  MarketTradeAnalysisQuery,
  MarketTradeAnalysisResult,
  MarketTradeListResult,
  MarketTradeQuery,
  MarketTradeSyncStatus,
  TradingRuntimeConnectionStatus,
  TradingRuntimeMarketTradeState,
} from '@polytrader/shared';

interface TradingMarketTradeRepositoryFactory {
  createMarketTradeRepository(marketId: string, conditionId: string): MarketTradeRepository;
}

interface TradingMarketRuntimeTradeSync {
  start(marketId: string, conditionId: string): MarketTradeSyncStatus;
  status(marketId: string, conditionId: string): Promise<MarketTradeSyncStatus>;
  onStatus(callback: (status: MarketTradeSyncStatus) => void): () => void;
}

interface TradingMarketTradeServiceOptions {
  repositoryFactory: TradingMarketTradeRepositoryFactory;
  sync: TradingMarketRuntimeTradeSync;
}

type TradingMarketTradeSyncServiceOptions = TradingMarketTradeServiceOptions;
type TradingMarketTradeAnalysisServiceOptions = TradingMarketTradeServiceOptions;

interface TradingMarketTradeRefreshInput {
  marketId: string;
  conditionId?: string | null;
}

interface TradingMarketTradeListInput {
  marketId: string;
  conditionId?: string | null;
  currentState: TradingRuntimeMarketTradeState;
  query: MarketTradeQuery;
}

interface TradingMarketTradeAnalysisInput {
  marketId: string;
  conditionId?: string | null;
  currentState: TradingRuntimeMarketTradeState;
  query: MarketTradeAnalysisQuery;
}

interface TradingMarketTradeRepositoryListInput {
  marketId: string;
  conditionId: string;
  query: MarketTradeQuery;
  syncStatus: MarketTradeSyncStatus;
}

interface TradingMarketTradeRepositoryAnalysisInput {
  marketId: string;
  conditionId: string;
  query: MarketTradeAnalysisQuery;
  syncStatus: MarketTradeSyncStatus;
}

interface TradingMarketTradeSyncStatusInput {
  conditionId?: string | null;
  currentState: TradingRuntimeMarketTradeState;
  syncStatus: MarketTradeSyncStatus;
}

interface TradingMarketTradeStateResult {
  state: TradingRuntimeMarketTradeState;
  status: TradingRuntimeConnectionStatus;
  error: string;
}

interface TradingMarketTradeListResult extends TradingMarketTradeStateResult {
  result: MarketTradeListResult;
}

interface TradingMarketTradeAnalysisResult extends TradingMarketTradeStateResult {
  result: MarketTradeAnalysisResult;
}

export type {
  TradingMarketTradeAnalysisInput,
  TradingMarketTradeAnalysisResult,
  TradingMarketTradeAnalysisServiceOptions,
  TradingMarketTradeListInput,
  TradingMarketTradeListResult,
  TradingMarketTradeRefreshInput,
  TradingMarketTradeRepositoryAnalysisInput,
  TradingMarketTradeRepositoryListInput,
  TradingMarketTradeRepositoryFactory,
  TradingMarketTradeServiceOptions,
  TradingMarketTradeStateResult,
  TradingMarketTradeSyncServiceOptions,
  TradingMarketTradeSyncStatusInput,
  TradingMarketRuntimeTradeSync,
};
