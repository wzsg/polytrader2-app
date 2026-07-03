import type { MarketPriceHistoryRepository } from '@polytrader/repository-contract';
import type { MarketDetailData, PriceHistoryPoint } from '@polytrader/shared';

interface TradingMarketPriceHistoryStreamPage {
  tokenId: string;
  interval: string;
  fidelity: number;
  pointOffset: number;
  complete: boolean;
  points: PriceHistoryPoint[];
}

interface TradingMarketPriceHistoryApiClient {
  streamPriceHistory(
    tokenIds: string[],
    interval?: string,
    fidelity?: number,
    signal?: AbortSignal,
  ): AsyncIterable<TradingMarketPriceHistoryStreamPage>;
}

interface TradingMarketPriceHistoryRepositoryFactory {
  createMarketPriceHistoryRepository(
    marketId: string,
    conditionId: string,
  ): MarketPriceHistoryRepository;
}

interface TradingMarketPriceHistoryServiceOptions {
  apiClient: TradingMarketPriceHistoryApiClient;
  repositoryFactory: TradingMarketPriceHistoryRepositoryFactory;
}

interface TradingMarketPriceHistoryLoadInput {
  marketId: string;
  conditionId: string;
  outcomes: MarketDetailData['outcomes'];
  interval?: string;
  fidelity?: number;
}

interface TradingMarketPriceHistoryLoadResult {
  priceHistory: Record<string, PriceHistoryPoint[]>;
  error: string;
}

type TradingMarketPriceHistoryWarmInput = TradingMarketPriceHistoryLoadInput;

interface TradingMarketPriceHistoryRefreshTask {
  key: string;
  controller: AbortController;
  promise: Promise<void>;
}

interface TradingMarketPriceHistoryContext {
  marketId: string;
  conditionId: string;
  interval: string;
  priorityFidelity: number;
  repository: MarketPriceHistoryRepository;
  outcomes: MarketDetailData['outcomes'];
  tokenIds: string[];
}

export type {
  TradingMarketPriceHistoryApiClient,
  TradingMarketPriceHistoryLoadInput,
  TradingMarketPriceHistoryLoadResult,
  TradingMarketPriceHistoryRepositoryFactory,
  TradingMarketPriceHistoryServiceOptions,
  TradingMarketPriceHistoryStreamPage,
  TradingMarketPriceHistoryContext,
  TradingMarketPriceHistoryWarmInput,
  TradingMarketPriceHistoryRefreshTask,
};
