import { EventEmitter } from 'events';
import type { MarketPriceHistorySyncState } from '@polytrader/repository-contract';
import type { PriceHistoryPoint } from '@polytrader/shared';
import type { TradingMarketPriceHistoryServiceEventMap } from './tradingMarketPriceHistoryEvents.js';
import type {
  TradingMarketPriceHistoryApiClient,
  TradingMarketPriceHistoryContext,
  TradingMarketPriceHistoryLoadInput,
  TradingMarketPriceHistoryLoadResult,
  TradingMarketPriceHistoryRefreshTask,
  TradingMarketPriceHistoryRepositoryFactory,
  TradingMarketPriceHistoryServiceOptions,
  TradingMarketPriceHistoryWarmInput,
} from './types.js';

const DEFAULT_PRICE_HISTORY_INTERVAL = '1d';
const DEFAULT_PRICE_HISTORY_FIDELITY = 5;
const PRICE_HISTORY_FIDELITIES = [1, 5, 15, 30, 60, 240, 1440, 10080] as const;
const INITIAL_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;

class TradingMarketPriceHistoryService extends EventEmitter<TradingMarketPriceHistoryServiceEventMap> {
  private readonly _apiClient: TradingMarketPriceHistoryApiClient;
  private readonly _repositoryFactory: TradingMarketPriceHistoryRepositoryFactory;
  private readonly _refreshTasks = new Map<string, TradingMarketPriceHistoryRefreshTask>();

  public constructor(options: TradingMarketPriceHistoryServiceOptions) {
    super();
    this._apiClient = options.apiClient;
    this._repositoryFactory = options.repositoryFactory;
  }

  public async loadPriceHistory(
    input: TradingMarketPriceHistoryLoadInput,
  ): Promise<TradingMarketPriceHistoryLoadResult> {
    const context = this._createContext(input);
    if (!context.tokenIds.length) return { priceHistory: {}, error: '' };

    const query = this._createQuery(context, context.priorityFidelity, context.tokenIds);
    const localPriceHistory = await context.repository.listPriceHistory(query);
    const states = await context.repository.getSyncState(query);
    const staleTokenIds = this._staleTokenIds(states, context.priorityFidelity);
    const incompleteTokenIds = this._incompleteTokenIds(localPriceHistory, states);

    if (!incompleteTokenIds.length) {
      if (staleTokenIds.length) {
        this._startRefreshTask(context, context.priorityFidelity, staleTokenIds, true);
      }
      return { priceHistory: localPriceHistory, error: '' };
    }

    const tokenIdsToRefresh = this._normalizeTokenIds([...staleTokenIds, ...incompleteTokenIds]);
    await this._startRefreshTask(
      context,
      context.priorityFidelity,
      tokenIdsToRefresh,
      false,
    );
    return {
      priceHistory: await context.repository.listPriceHistory(query),
      error: '',
    };
  }

  public warmPriceHistoryCache(input: TradingMarketPriceHistoryWarmInput): void {
    const context = this._createContext(input);
    if (!context.tokenIds.length) return;
    this._startRefreshTask(context, context.priorityFidelity, context.tokenIds, true);
  }

  public stopPriceHistoryRefresh(): void {
    for (const task of this._refreshTasks.values()) {
      task.controller.abort();
    }
    this._refreshTasks.clear();
  }

  private _startRefreshTask(
    context: TradingMarketPriceHistoryContext,
    fidelity: number,
    tokenIds: string[],
    emitUpdates: boolean,
  ): Promise<void> {
    const normalizedTokenIds = this._normalizeTokenIds(tokenIds);
    if (!normalizedTokenIds.length) return Promise.resolve();

    const key = this._refreshTaskKey(context, fidelity, normalizedTokenIds);
    const existing = this._refreshTasks.get(key);
    if (existing && !existing.controller.signal.aborted) return existing.promise;

    const controller = new AbortController();
    const task: TradingMarketPriceHistoryRefreshTask = {
      key,
      controller,
      promise: Promise.resolve(),
    };
    task.promise = this._runRefreshLoop(
      context,
      fidelity,
      normalizedTokenIds,
      emitUpdates,
      controller.signal,
    ).finally(() => {
      if (this._refreshTasks.get(key) === task) this._refreshTasks.delete(key);
    });
    this._refreshTasks.set(key, task);
    return task.promise;
  }

  private async _runRefreshLoop(
    context: TradingMarketPriceHistoryContext,
    fidelity: number,
    tokenIds: string[],
    emitUpdates: boolean,
    signal: AbortSignal,
  ): Promise<void> {
    let retryDelayMs = INITIAL_RETRY_DELAY_MS;

    while (!signal.aborted) {
      try {
        await this._refreshFidelity(context, fidelity, tokenIds, emitUpdates, signal);
        return;
      } catch {
        if (signal.aborted) return;
      }

      await this._sleep(retryDelayMs, signal);
      retryDelayMs = Math.min(retryDelayMs * 2, MAX_RETRY_DELAY_MS);
    }
  }

  private async _refreshFidelity(
    context: TradingMarketPriceHistoryContext,
    fidelity: number,
    tokenIds: string[],
    emitUpdates: boolean,
    signal: AbortSignal,
  ): Promise<void> {
    const fetchedAt = this._now();
    const completedTokenIds = new Set<string>();
    const pointCountByToken = new Map(tokenIds.map((tokenId) => [tokenId, 0]));
    const existingPoints = await context.repository.listPriceHistory(
      this._createQuery(context, fidelity, tokenIds),
    );
    const existingPointsByToken = this._pointsByTokenTime(existingPoints);

    try {
      for await (const page of this._apiClient.streamPriceHistory(
        tokenIds,
        context.interval,
        fidelity,
        signal,
      )) {
        if (signal.aborted) return;
        if (!tokenIds.includes(page.tokenId)) continue;

        const points = this._normalizePoints(page.points);
        const changedPoints = this._changedPoints(existingPointsByToken, page.tokenId, points);
        if (points.length) {
          await this._storePointChunk(
            context,
            page.tokenId,
            context.interval,
            fidelity,
            points,
            fetchedAt,
          );
          pointCountByToken.set(
            page.tokenId,
            (pointCountByToken.get(page.tokenId) ?? 0) + points.length,
          );
        }
        if (emitUpdates && changedPoints.length)
          this._emitUpdated(context, fidelity, { [page.tokenId]: changedPoints });

        if (page.complete) {
          completedTokenIds.add(page.tokenId);
          await context.repository.markSyncState({
            marketId: context.marketId,
            conditionId: context.conditionId,
            tokenId: page.tokenId,
            interval: context.interval,
            fidelity,
            pointCount: pointCountByToken.get(page.tokenId) ?? 0,
            error: null,
            fetchedAt,
          });
        }
      }

      const incompleteTokenIds = tokenIds.filter((tokenId) => !completedTokenIds.has(tokenId));
      if (incompleteTokenIds.length) {
        const message = 'Price history stream ended before all tokens completed';
        await this._markIncompleteTokens(
          context,
          tokenIds,
          completedTokenIds,
          context.interval,
          fidelity,
          fetchedAt,
          message,
        );
        throw new Error(message);
      }
    } catch (error) {
      if (signal.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      await this._markIncompleteTokens(
        context,
        tokenIds,
        completedTokenIds,
        context.interval,
        fidelity,
        fetchedAt,
        message,
      ).catch(() => undefined);
      throw error;
    }
  }

  private async _storePointChunk(
    context: TradingMarketPriceHistoryContext,
    tokenId: string,
    interval: string,
    fidelity: number,
    points: PriceHistoryPoint[],
    fetchedAt: string,
  ): Promise<void> {
    const outcome = context.outcomes.find((item) => item.tokenId === tokenId);
    await context.repository.upsertPriceHistory({
      marketId: context.marketId,
      conditionId: context.conditionId,
      tokenId,
      outcome: outcome?.label ?? null,
      interval,
      fidelity,
      points,
      fetchedAt,
    });
  }

  private async _markIncompleteTokens(
    context: TradingMarketPriceHistoryContext,
    tokenIds: string[],
    completedTokenIds: Set<string>,
    interval: string,
    fidelity: number,
    fetchedAt: string,
    error: string,
  ): Promise<void> {
    for (const tokenId of tokenIds) {
      if (completedTokenIds.has(tokenId)) continue;
      await context.repository.markSyncState({
        marketId: context.marketId,
        conditionId: context.conditionId,
        tokenId,
        interval,
        fidelity,
        pointCount: 0,
        error,
        fetchedAt,
      });
    }
  }

  private _createContext(
    input: TradingMarketPriceHistoryWarmInput,
  ): TradingMarketPriceHistoryContext {
    const marketId = this._normalizeRequired(input.marketId, 'marketId is required');
    const conditionId = this._normalizeRequired(input.conditionId, 'conditionId is required');
    const interval = this._normalizeInterval(input.interval);
    const priorityFidelity = this._normalizeFidelity(input.fidelity);
    const tokenIds = this._normalizeTokenIds(input.outcomes.map((outcome) => outcome.tokenId));
    return {
      marketId,
      conditionId,
      interval,
      priorityFidelity,
      repository: this._repositoryFactory.createMarketPriceHistoryRepository(marketId, conditionId),
      outcomes: input.outcomes,
      tokenIds,
    };
  }

  private _createQuery(
    context: TradingMarketPriceHistoryContext,
    fidelity: number,
    tokenIds: string[],
  ): {
    marketId: string;
    conditionId: string;
    tokenIds: string[];
    interval: string;
    fidelity: number;
  } {
    return {
      marketId: context.marketId,
      conditionId: context.conditionId,
      tokenIds,
      interval: context.interval,
      fidelity,
    };
  }

  private _refreshTaskKey(
    context: TradingMarketPriceHistoryContext,
    fidelity: number,
    tokenIds: string[],
  ): string {
    return [
      context.marketId,
      context.conditionId,
      context.interval,
      fidelity,
      tokenIds.join(','),
    ].join('\u0000');
  }

  private _staleTokenIds(states: MarketPriceHistorySyncState[], fidelity: number): string[] {
    const now = Date.now();
    const freshnessMs = fidelity * 60_000;
    return states
      .filter((state) => {
        if (state.error) return true;
        if (!state.lastFetchedAt || state.pointCount <= 0) return true;
        const fetchedAt = new Date(state.lastFetchedAt).getTime();
        return !Number.isFinite(fetchedAt) || now - fetchedAt >= freshnessMs;
      })
      .map((state) => state.tokenId);
  }

  private _incompleteTokenIds(
    priceHistory: Record<string, PriceHistoryPoint[]>,
    states: MarketPriceHistorySyncState[],
  ): string[] {
    return states
      .filter((state) => {
        if (state.error || !state.lastFetchedAt) return true;
        if (state.pointCount <= 0) return false;
        return !(priceHistory[state.tokenId] ?? []).length;
      })
      .map((state) => state.tokenId);
  }

  private _pointsByTokenTime(
    priceHistory: Record<string, PriceHistoryPoint[]>,
  ): Map<string, Map<number, number>> {
    const output = new Map<string, Map<number, number>>();
    for (const [tokenId, points] of Object.entries(priceHistory)) {
      output.set(tokenId, new Map(points.map((point) => [point.t, point.p])));
    }
    return output;
  }

  private _changedPoints(
    existingPointsByToken: Map<string, Map<number, number>>,
    tokenId: string,
    points: PriceHistoryPoint[],
  ): PriceHistoryPoint[] {
    const existing = existingPointsByToken.get(tokenId) ?? new Map<number, number>();
    const changed: PriceHistoryPoint[] = [];
    for (const point of points) {
      if (existing.get(point.t) === point.p) continue;
      existing.set(point.t, point.p);
      changed.push(point);
    }
    existingPointsByToken.set(tokenId, existing);
    return changed;
  }

  private _hasPriceHistory(priceHistory: Record<string, PriceHistoryPoint[]>): boolean {
    return Object.values(priceHistory).some((points) => points.length > 0);
  }

  private _normalizePoints(points: PriceHistoryPoint[]): PriceHistoryPoint[] {
    return points
      .map((point) => ({ t: Number(point.t), p: Number(point.p) }))
      .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.p))
      .sort((a, b) => a.t - b.t);
  }

  private _normalizeFidelity(value: number | undefined): number {
    const numeric = Math.max(1, Math.trunc(Number(value) || DEFAULT_PRICE_HISTORY_FIDELITY));
    let best: number = PRICE_HISTORY_FIDELITIES[0];
    for (const item of PRICE_HISTORY_FIDELITIES) {
      if (Math.abs(item - numeric) < Math.abs(best - numeric)) best = item;
    }
    return best;
  }

  private _normalizeInterval(interval: string | undefined): string {
    if (interval === 'max' || interval === 'all' || interval === '1m') return interval;
    if (interval === '1w' || interval === '1d' || interval === '6h' || interval === '1h') {
      return interval;
    }
    return DEFAULT_PRICE_HISTORY_INTERVAL;
  }

  private _normalizeRequired(value: string, message: string): string {
    const normalized = String(value || '').trim();
    if (!normalized) throw new Error(message);
    return normalized;
  }

  private _normalizeTokenIds(tokenIds: string[]): string[] {
    return [...new Set(tokenIds.map((tokenId) => String(tokenId || '').trim()).filter(Boolean))];
  }

  private _emitUpdated(
    context: TradingMarketPriceHistoryContext,
    fidelity: number,
    pointsByToken: Record<string, PriceHistoryPoint[]>,
  ): void {
    if (!this._hasPriceHistory(pointsByToken)) return;
    this.emit('price-history-updated', {
      marketId: context.marketId,
      conditionId: context.conditionId,
      interval: context.interval,
      fidelity,
      pointsByToken,
    });
  }

  private _sleep(delayMs: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, delayMs);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }

  private _now(): string {
    return new Date().toISOString();
  }
}

export { TradingMarketPriceHistoryService };
export type {
  TradingMarketPriceHistoryApiClient,
  TradingMarketPriceHistoryLoadInput,
  TradingMarketPriceHistoryLoadResult,
  TradingMarketPriceHistoryRepositoryFactory,
  TradingMarketPriceHistoryServiceOptions,
};
