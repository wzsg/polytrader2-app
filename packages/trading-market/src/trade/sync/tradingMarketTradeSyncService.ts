import type {
  MarketTradeListResult,
  MarketTradeSyncStatus,
  TradingRuntimeMarketTradeState,
} from '@polytrader/shared';
import type {
  TradingMarketTradeListInput,
  TradingMarketTradeListResult,
  TradingMarketTradeRepositoryListInput,
  TradingMarketTradeRepositoryFactory,
  TradingMarketTradeStateResult,
  TradingMarketTradeSyncServiceOptions,
  TradingMarketTradeSyncStatusInput,
  TradingMarketRuntimeTradeSync,
} from '../types.js';

class TradingMarketTradeSyncService {
  private readonly _repositoryFactory: TradingMarketTradeRepositoryFactory;
  private readonly _sync: TradingMarketRuntimeTradeSync;

  public constructor(options: TradingMarketTradeSyncServiceOptions) {
    this._repositoryFactory = options.repositoryFactory;
    this._sync = options.sync;
  }

  public createEmptyState(): TradingRuntimeMarketTradeState {
    return {
      syncStatus: null,
      recent: null,
      analysis: null,
      error: '',
      updatedAt: null,
    };
  }

  public applySyncStatus(
    input: TradingMarketTradeSyncStatusInput,
  ): TradingMarketTradeStateResult | null {
    if (input.conditionId && input.syncStatus.conditionId !== input.conditionId) return null;
    const state: TradingRuntimeMarketTradeState = {
      ...input.currentState,
      syncStatus: input.syncStatus,
      error: input.syncStatus.error || '',
      updatedAt: this._now(),
    };
    return {
      state,
      status: input.syncStatus.error
        ? 'error'
        : input.syncStatus.totalCached || input.syncStatus.backfilled
          ? 'ready'
          : 'loading',
      error: input.syncStatus.error || '',
    };
  }

  public startMarketTradeSync(marketId: string, conditionId: string): MarketTradeSyncStatus {
    return this._sync.start(marketId, conditionId);
  }

  public getMarketTradeSyncStatus(
    marketId: string,
    conditionId: string,
  ): Promise<MarketTradeSyncStatus> {
    return this._sync.status(marketId, conditionId);
  }

  public async queryMarketTrades(
    input: TradingMarketTradeRepositoryListInput,
  ): Promise<MarketTradeListResult> {
    const repository = this._repositoryFactory.createMarketTradeRepository(
      input.marketId,
      input.conditionId,
    );
    return repository.listMarketTrades(input.query, input.syncStatus);
  }

  public async listMarketTrades(
    input: TradingMarketTradeListInput,
  ): Promise<TradingMarketTradeListResult> {
    const conditionId = input.query.conditionId || input.conditionId;
    if (!conditionId) throw new Error('conditionId is required to query market trades');
    this.startMarketTradeSync(input.marketId, conditionId);
    const syncStatus = await this.getMarketTradeSyncStatus(input.marketId, conditionId);
    const result = await this.queryMarketTrades({
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
        recent: result,
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

export { TradingMarketTradeSyncService };
