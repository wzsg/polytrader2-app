import type { MarketTradeAnalysisResult } from '@polytrader/shared';
import type {
  TradingMarketTradeAnalysisInput,
  TradingMarketTradeAnalysisResult,
  TradingMarketTradeAnalysisServiceOptions,
  TradingMarketTradeRepositoryAnalysisInput,
  TradingMarketTradeRepositoryFactory,
  TradingMarketRuntimeTradeSync,
} from '../types.js';

class TradingMarketTradeAnalysisService {
  private readonly _repositoryFactory: TradingMarketTradeRepositoryFactory;
  private readonly _sync: TradingMarketRuntimeTradeSync;

  public constructor(options: TradingMarketTradeAnalysisServiceOptions) {
    this._repositoryFactory = options.repositoryFactory;
    this._sync = options.sync;
  }

  public async queryMarketTradeAnalysis(
    input: TradingMarketTradeRepositoryAnalysisInput,
  ): Promise<MarketTradeAnalysisResult> {
    const repository = this._repositoryFactory.createMarketTradeRepository(
      input.marketId,
      input.conditionId,
    );
    return repository.getMarketTradeAnalysis(input.query, input.syncStatus);
  }

  public async getMarketTradeAnalysis(
    input: TradingMarketTradeAnalysisInput,
  ): Promise<TradingMarketTradeAnalysisResult> {
    const conditionId = input.query.conditionId || input.conditionId;
    if (!conditionId) throw new Error('conditionId is required to query trade analysis');
    this._sync.start(input.marketId, conditionId);
    const syncStatus = await this._sync.status(input.marketId, conditionId);
    const result = await this.queryMarketTradeAnalysis({
      marketId: input.marketId,
      conditionId,
      query: input.query,
      syncStatus,
    });
    const error = result.error || '';
    return {
      result,
      state: {
        ...input.currentState,
        syncStatus: result.syncStatus,
        analysis: result,
        error,
        updatedAt: this._now(),
      },
      status: error ? 'error' : 'ready',
      error,
    };
  }

  private _now(): string {
    return new Date().toISOString();
  }
}

export { TradingMarketTradeAnalysisService };
