import { TradingMarketTradeAnalysisService } from './analysis/tradingMarketTradeAnalysisService.js';
import { TradingMarketTradeSyncService } from './sync/tradingMarketTradeSyncService.js';
import type {
  MarketTradeAnalysisQuery,
  MarketTradeQuery,
  TradingRuntimeMarketTradeState,
} from '@polytrader/shared';
import type {
  TradingMarketTradeAnalysisInput,
  TradingMarketTradeAnalysisResult,
  TradingMarketTradeListInput,
  TradingMarketTradeListResult,
  TradingMarketTradeRefreshInput,
  TradingMarketTradeServiceOptions,
  TradingMarketTradeStateResult,
  TradingMarketTradeSyncStatusInput,
} from './types.js';

const DEFAULT_MARKET_TRADES_LIMIT = 200;
const MARKET_TRADE_QUERY_TIMEOUT_MS = 2_500;

class TradingMarketTradeService {
  private readonly _syncService: TradingMarketTradeSyncService;
  private readonly _analysisService: TradingMarketTradeAnalysisService;

  public constructor(options: TradingMarketTradeServiceOptions) {
    this._syncService = new TradingMarketTradeSyncService(options);
    this._analysisService = new TradingMarketTradeAnalysisService(options);
  }

  public createEmptyState(): TradingRuntimeMarketTradeState {
    return this._syncService.createEmptyState();
  }

  public applySyncStatus(
    input: TradingMarketTradeSyncStatusInput,
  ): TradingMarketTradeStateResult | null {
    return this._syncService.applySyncStatus(input);
  }

  public async refreshMarketTrades(
    input: TradingMarketTradeRefreshInput,
  ): Promise<TradingMarketTradeStateResult | null> {
    const conditionId = input.conditionId?.trim();
    if (!conditionId) return null;

    const syncStatus = this._syncService.startMarketTradeSync(input.marketId, conditionId);
    const query: MarketTradeQuery = {
      marketId: input.marketId,
      conditionId,
      sortField: 'time',
      sortOrder: 'desc',
      limit: DEFAULT_MARKET_TRADES_LIMIT,
      offset: 0,
    };
    const analysisQuery: MarketTradeAnalysisQuery = {
      marketId: input.marketId,
      conditionId,
      bucket: '5m',
    };
    const currentStatus = await this._syncService.getMarketTradeSyncStatus(
      input.marketId,
      conditionId,
    );

    if (!currentStatus.totalCached && !currentStatus.backfilled) {
      const state: TradingRuntimeMarketTradeState = {
        syncStatus: currentStatus,
        recent: null,
        analysis: null,
        error: currentStatus.error || '',
        updatedAt: this._now(),
      };
      return {
        state,
        status: currentStatus.error ? 'error' : 'loading',
        error: currentStatus.error || '',
      };
    }

    const [recentResult, analysisResult] = await Promise.allSettled([
      this._timeout(
        this._syncService.queryMarketTrades({
          marketId: input.marketId,
          conditionId,
          query,
          syncStatus: currentStatus,
        }),
        MARKET_TRADE_QUERY_TIMEOUT_MS,
        'Market trades query',
      ),
      this._timeout(
        this._analysisService.queryMarketTradeAnalysis({
          marketId: input.marketId,
          conditionId,
          query: analysisQuery,
          syncStatus: currentStatus,
        }),
        MARKET_TRADE_QUERY_TIMEOUT_MS,
        'Trade analysis query',
      ),
    ]);
    const recent = recentResult.status === 'fulfilled' ? recentResult.value : null;
    const analysis = analysisResult.status === 'fulfilled' ? analysisResult.value : null;
    const queryError =
      (recentResult.status === 'rejected' ? this._errorMessage(recentResult.reason) : '') ||
      (analysisResult.status === 'rejected' ? this._errorMessage(analysisResult.reason) : '');
    const error = recent?.error || analysis?.error || syncStatus.error || queryError;
    const state: TradingRuntimeMarketTradeState = {
      syncStatus,
      recent,
      analysis,
      error,
      updatedAt: this._now(),
    };
    return {
      state,
      status: recent || analysis ? (error ? 'error' : 'ready') : 'loading',
      error,
    };
  }

  public async listMarketTrades(
    input: TradingMarketTradeListInput,
  ): Promise<TradingMarketTradeListResult> {
    return this._syncService.listMarketTrades(input);
  }

  public async getMarketTradeAnalysis(
    input: TradingMarketTradeAnalysisInput,
  ): Promise<TradingMarketTradeAnalysisResult> {
    return this._analysisService.getMarketTradeAnalysis(input);
  }

  private _timeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  private _errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private _now(): string {
    return new Date().toISOString();
  }
}

export { TradingMarketTradeService };
export type {
  TradingMarketTradeAnalysisInput,
  TradingMarketTradeAnalysisResult,
  TradingMarketTradeListInput,
  TradingMarketTradeListResult,
  TradingMarketTradeRefreshInput,
  TradingMarketTradeRepositoryFactory,
  TradingMarketTradeServiceOptions,
  TradingMarketTradeStateResult,
  TradingMarketTradeSyncStatusInput,
  TradingMarketRuntimeTradeSync,
} from './types.js';
