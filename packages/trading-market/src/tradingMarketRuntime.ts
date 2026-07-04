import type {
  GammaEventRaw,
  MarketDetailData,
  MarketTradeAnalysisQuery,
  MarketTradeAnalysisResult,
  MarketTradeListResult,
  MarketTradeQuery,
  MarketTradeSyncStatus,
  TradingMarketEvent,
  TradingMarketEventMap,
  TradingMarketEventName,
  TradingMarketSubscribeOptions,
  TradingRuntimeLoadScope,
  TradingRuntimeMarketTradeState,
  TradingRuntimeConnectionStatus,
  TradingMarketSnapshot,
  TradingWindowInput,
  TradingRuntimeCryptoTickState,
} from '@polytrader/shared';
import { EventEmitter } from 'events';
import { createOrderBookWebSocketClient } from './order-book/index.js';
import { TradingMarketTradeService } from './trade/tradingMarketTradeService.js';
import { TradingMarketPriceHistoryService } from './price-history/index.js';
import { createTradingCryptoTickClient } from './crypto-tick/index.js';
import { resolveCryptoTickStartInput } from './crypto-tick/tradingCryptoTickMetadata.js';
import { TRADING_MARKET_RUNTIME_EVENT_NAMES } from './tradingMarketRuntimeEvents.js';
import type { TradingMarketRuntime, TradingMarketServiceOptions } from './types.js';
import type { TradingMarketRuntimeEventMap } from './tradingMarketRuntimeEvents.js';
import type { OrderBookWebSocketClient } from './order-book/index.js';
import type { TradingCryptoTickClient } from './crypto-tick/index.js';
import type { TradingMarketPriceHistoryUpdatedEvent } from './price-history/index.js';
import type {
  TradingMarketTradeStateResult,
  TradingMarketTradeRepositoryFactory,
  TradingMarketRuntimeTradeSync,
} from './trade/tradingMarketTradeService.js';
import type { TradingMarketPriceHistoryRepositoryFactory } from './price-history/index.js';

const MARKET_DETAIL_REFRESH_MS = 30_000;
type SessionStatus = Record<TradingRuntimeLoadScope, TradingRuntimeConnectionStatus>;

interface TradingMarketRuntimeOptions extends TradingMarketServiceOptions {
  marketId: string;
}

class TradingMarketRuntimeImpl
  extends EventEmitter<TradingMarketRuntimeEventMap>
  implements TradingMarketRuntime
{
  private readonly _marketId: string;
  private readonly _options: TradingMarketServiceOptions;
  private readonly _marketTradeService: TradingMarketTradeService;
  private readonly _priceHistoryService: TradingMarketPriceHistoryService;
  private readonly _seqByScope = new Map<TradingRuntimeLoadScope, number>();
  private _eventId = '';
  private _selectedTokenId = '';
  private _selectedOutcome: string | null = null;
  private _metadata: unknown;
  private _event: GammaEventRaw | null = null;
  private _marketDetail: MarketDetailData | null = null;
  private _priceHistory: TradingMarketSnapshot['priceHistory'] = {};
  private _cryptoTick: TradingRuntimeCryptoTickState | null = null;
  private _marketTrades: TradingRuntimeMarketTradeState;
  private _status: SessionStatus;
  private _errors: TradingMarketSnapshot['errors'] = {};
  private _updatedAt: string | null = null;
  private _orderbook: OrderBookWebSocketClient | null = null;
  private _cryptoTickService: TradingCryptoTickClient | null = null;
  private _cryptoTickKey = '';
  private _detailRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private _detailRefreshInFlight = false;

  public constructor(options: TradingMarketRuntimeOptions) {
    super();
    this._marketId = options.marketId;
    this._options = options;
    this._marketTradeService = new TradingMarketTradeService({
      repositoryFactory: options.marketTradeRepositoryFactory,
      sync: options.marketTradeSync,
    });
    this._priceHistoryService = new TradingMarketPriceHistoryService({
      apiClient: options.apiClient,
      repositoryFactory: options.marketPriceHistoryRepositoryFactory,
    });
    this._priceHistoryService.on('price-history-updated', (event) => {
      this._handlePriceHistoryUpdated(event);
    });
    this._marketTrades = this._marketTradeService.createEmptyState();
    this._status = this._createDefaultStatus();
  }

  public get marketId(): string {
    return this._marketId;
  }

  public async initialize(
    input: TradingWindowInput,
    options: TradingMarketSubscribeOptions,
  ): Promise<TradingMarketSnapshot> {
    this._eventId = input.eventId || this._eventId;
    this._metadata = input.metadata;
    this.selectToken(
      input.tokenId || this._selectedTokenId,
      input.outcome ?? this._selectedOutcome,
    );

    await Promise.all([
      this._refreshEvent(),
      this._refreshMarketDetail({ startOrderBook: options.startOrderBook !== false }),
    ]);
    this._syncCryptoTickService();

    const tasks: Array<Promise<void>> = [];
    if (options.loadPriceHistory !== false) {
      tasks.push(this._refreshPriceHistory());
    }
    if (options.startMarketTradeSync !== false) tasks.push(this._refreshMarketTrades());
    this._runBackgroundTasks(tasks);
    this._emitSnapshot();
    return this.snapshot();
  }

  public async loadMarketDetail(): Promise<TradingMarketSnapshot> {
    await this._refreshMarketDetail({ startOrderBook: true });
    this._emitSnapshot();
    return this.snapshot();
  }

  public selectToken(tokenId?: string | null, outcome?: string | null): TradingMarketSnapshot {
    const normalized = tokenId?.trim() || '';
    if (normalized) this._selectedTokenId = normalized;
    this._selectedOutcome = outcome ?? this._resolveSelectedOutcome();
    this._updatedAt = this._now();
    this._emitSnapshot();
    return this.snapshot();
  }

  public snapshot(): TradingMarketSnapshot {
    const orderbookSnapshot = this._orderbook?.snapshot() ?? {
      orderBooks:
        this._marketDetail?.outcomes.map((outcome) => ({
          tokenId: outcome.tokenId,
          label: outcome.label,
          bids: [],
          asks: [],
          tickSize: null,
          minOrderSize: null,
          lastTradePrice: null,
          lastTradeSide: null,
          lastTradePriceRaw: null,
          unavailable: true,
        })) ?? [],
      recentLiveTrades: [],
      wsStatus: 'disconnected' as const,
    };

    return {
      marketId: this._marketId,
      eventId: this._eventId,
      selectedTokenId: this._selectedTokenId,
      selectedOutcome: this._selectedOutcome,
      metadata: this._metadata,
      status: { ...this._status },
      errors: { ...this._errors },
      event: this._event,
      marketDetail: this._marketDetail,
      orderBooks: orderbookSnapshot.orderBooks,
      recentLiveTrades: orderbookSnapshot.recentLiveTrades,
      wsStatus: orderbookSnapshot.wsStatus,
      priceHistory: { ...this._priceHistory },
      cryptoTick: this._cloneCryptoTickState(this._cryptoTick),
      marketTrades: {
        ...this._marketTrades,
        recent: this._marketTrades.recent
          ? {
              ...this._marketTrades.recent,
              items: [...this._marketTrades.recent.items],
            }
          : null,
      },
      updatedAt: this._updatedAt,
    };
  }

  public handleMarketTradeSyncStatus(syncStatus: MarketTradeSyncStatus): void {
    const result = this._marketTradeService.applySyncStatus({
      conditionId: this._marketDetail?.market.conditionId ?? null,
      currentState: this._marketTrades,
      syncStatus,
    });
    if (!result) return;
    this._applyMarketTradeState(result);
  }

  public dispose(): void {
    if (this._detailRefreshTimer) clearInterval(this._detailRefreshTimer);
    this._detailRefreshTimer = null;
    this._priceHistoryService.stopPriceHistoryRefresh();
    this._priceHistoryService.removeAllListeners();
    this.removeAllListeners();
    this._orderbook?.dispose();
    this._orderbook = null;
    this._cryptoTickService?.dispose();
    this._cryptoTickService = null;
    this._cryptoTick = null;
  }

  public async loadPriceHistory(
    interval?: string,
    fidelity?: number,
  ): Promise<TradingMarketSnapshot> {
    await this._refreshPriceHistory(interval, fidelity);
    this._emitSnapshot();
    return this.snapshot();
  }

  public async loadTrades(): Promise<TradingMarketSnapshot> {
    await this._refreshMarketTrades();
    this._emitSnapshot();
    return this.snapshot();
  }

  public async listMarketTrades(query: MarketTradeQuery): Promise<MarketTradeListResult> {
    const result = await this._marketTradeService.listMarketTrades({
      marketId: this._marketId,
      conditionId: this._marketDetail?.market.conditionId ?? null,
      currentState: this._marketTrades,
      query,
    });
    this._applyMarketTradeState(result);
    return result.result;
  }

  public async getMarketTradeAnalysis(
    query: MarketTradeAnalysisQuery,
  ): Promise<MarketTradeAnalysisResult> {
    const result = await this._marketTradeService.getMarketTradeAnalysis({
      marketId: this._marketId,
      conditionId: this._marketDetail?.market.conditionId ?? null,
      currentState: this._marketTrades,
      query,
    });
    this._applyMarketTradeState(result);
    return result.result;
  }

  public onEvent(callback: (event: TradingMarketEvent) => void): () => void {
    const unsubscribers = TRADING_MARKET_RUNTIME_EVENT_NAMES.map((eventName) => {
      const listener = (event: TradingMarketEventMap[typeof eventName]): void => {
        callback({ eventName, event } as TradingMarketEvent);
      };
      this.on(eventName, listener);
      return () => this.off(eventName, listener);
    });
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }

  private _now(): string {
    return new Date().toISOString();
  }

  private _createDefaultStatus(): SessionStatus {
    return {
      gammaEvent: 'idle',
      marketDetail: 'idle',
      orderBook: 'idle',
      priceHistory: 'idle',
      marketTrades: 'idle',
    };
  }

  private _nextSeq(scope: TradingRuntimeLoadScope): number {
    const next = (this._seqByScope.get(scope) ?? 0) + 1;
    this._seqByScope.set(scope, next);
    return next;
  }

  private _isCurrent(scope: TradingRuntimeLoadScope, seq: number): boolean {
    return this._seqByScope.get(scope) === seq;
  }

  private _runBackgroundTasks(tasks: Array<Promise<void>>): void {
    if (!tasks.length) return;
    void Promise.allSettled(tasks).then(() => {
      this._emitSnapshot();
    });
  }

  private _setStatus(
    scope: TradingRuntimeLoadScope,
    status: TradingRuntimeConnectionStatus,
    error = '',
  ): void {
    this._status[scope] = status;
    if (error) this._errors[scope] = error;
    else delete this._errors[scope];
    this._updatedAt = this._now();
    this._emitEvent('runtime-status', { marketId: this._marketId, scope, status, error });
  }

  private _applyMarketTradeState(result: TradingMarketTradeStateResult): void {
    this._marketTrades = result.state;
    this._setStatus('marketTrades', result.status, result.error);
    this._emitEvent('market-trades-state', {
      marketId: this._marketId,
      marketTrades: this._marketTrades,
    });
  }

  private async _refreshEvent(): Promise<void> {
    if (!this._eventId) return;
    const seq = this._nextSeq('gammaEvent');
    this._setStatus('gammaEvent', 'loading');
    try {
      const event = await this._options.apiClient.fetchEventById(this._eventId);
      if (!this._isCurrent('gammaEvent', seq)) return;
      this._event = event;
      this._setStatus('gammaEvent', 'ready');
      this._emitEvent('gamma-event', { marketId: this._marketId, event });
    } catch (error) {
      if (!this._isCurrent('gammaEvent', seq)) return;
      this._setStatus(
        'gammaEvent',
        'error',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async _refreshMarketDetail(options: { startOrderBook: boolean }): Promise<void> {
    const seq = this._nextSeq('marketDetail');
    this._setStatus('marketDetail', 'loading');
    try {
      const detail = await this._options.apiClient.fetchMarketDetail(this._marketId);
      if (!this._isCurrent('marketDetail', seq)) return;
      this._marketDetail = detail;
      if (
        !this._selectedTokenId ||
        !detail.outcomes.some((item) => item.tokenId === this._selectedTokenId)
      ) {
        this._selectedTokenId = detail.outcomes[0]?.tokenId || '';
      }
      this._selectedOutcome = this._resolveSelectedOutcome();
      this._setStatus('marketDetail', 'ready');
      this._emitEvent('market-detail', { marketId: this._marketId, data: detail });
      if (options.startOrderBook) this._startOrderBook();
      this._syncCryptoTickService();
      this._ensureMarketDetailRefreshTimer();
    } catch (error) {
      if (!this._isCurrent('marketDetail', seq)) return;
      this._setStatus(
        'marketDetail',
        'error',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private _ensureMarketDetailRefreshTimer(): void {
    if (this._detailRefreshTimer) return;
    this._detailRefreshTimer = setInterval(() => {
      if (this._detailRefreshInFlight) return;
      this._detailRefreshInFlight = true;
      void this._refreshMarketDetail({ startOrderBook: true }).finally(() => {
        this._detailRefreshInFlight = false;
      });
    }, MARKET_DETAIL_REFRESH_MS);
  }

  private _startOrderBook(): void {
    if (!this._marketDetail) return;
    if (!this._orderbook) {
      this._orderbook =
        this._options.orderbookFactory?.(this._marketId) ??
        createOrderBookWebSocketClient(this._marketId);
      this._orderbook.on('order-book-changed', () => {
        const snapshot = this._orderbook?.snapshot();
        if (!snapshot) return;
        this._status.orderBook =
          snapshot.wsStatus === 'live'
            ? 'ready'
            : snapshot.wsStatus === 'error'
              ? 'error'
              : 'loading';
        this._updatedAt = this._now();
        this._emitEvent('order-book', { marketId: this._marketId, ...snapshot });
      });
    }
    this._status.orderBook = 'loading';
    this._orderbook.setOutcomes(this._marketDetail.outcomes);
  }

  private _syncCryptoTickService(): void {
    const input = resolveCryptoTickStartInput({
      marketId: this._marketId,
      metadata: this._metadata,
      event: this._event,
      marketDetail: this._marketDetail,
    });
    if (!input) {
      this._disposeCryptoTickService();
      return;
    }

    const key = [
      input.marketId,
      input.symbol,
      input.window.closed ? 'closed' : 'live',
      input.window.startTime ?? '',
      input.window.endTime ?? '',
      input.window.displayStartTime ?? '',
      input.window.displayEndTime ?? '',
    ].join('|');
    if (!this._cryptoTickService) {
      this._cryptoTickService =
        this._options.cryptoTickFactory?.() ?? createTradingCryptoTickClient();
      this._cryptoTickService.on('crypto-tick-changed', (state) => {
        const previousStatus = this._cryptoTick?.status ?? null;
        this._cryptoTick = this._cloneCryptoTickState(state);
        this._updatedAt = this._now();
        this._emitEvent('crypto-tick', {
          marketId: this._marketId,
          cryptoTick: this._cloneCryptoTickState(state),
        });
        if (previousStatus === 'loading' && state.status !== 'loading') this._emitSnapshot();
      });
    }
    if (this._cryptoTickKey === key) {
      this._cryptoTick = this._cloneCryptoTickState(this._cryptoTickService.snapshot());
      return;
    }
    this._cryptoTickKey = key;
    this._cryptoTickService.start(input);
    this._cryptoTick = this._cloneCryptoTickState(this._cryptoTickService.snapshot());
  }

  private _disposeCryptoTickService(): void {
    if (!this._cryptoTickService && !this._cryptoTick) return;
    this._cryptoTickService?.dispose();
    this._cryptoTickService = null;
    this._cryptoTickKey = '';
    this._cryptoTick = null;
    this._emitEvent('crypto-tick', { marketId: this._marketId, cryptoTick: null });
  }

  private _cloneCryptoTickState(
    state: TradingRuntimeCryptoTickState | null,
  ): TradingRuntimeCryptoTickState | null {
    if (!state) return null;
    return {
      ...state,
      ticks: state.ticks.map((tick) => ({ ...tick })),
      latestTick: state.latestTick ? { ...state.latestTick } : null,
    };
  }

  private async _refreshPriceHistory(interval?: string, fidelity?: number): Promise<void> {
    const outcomes = this._marketDetail?.outcomes ?? [];
    if (!outcomes.length) return;
    const seq = this._nextSeq('priceHistory');
    this._setStatus('priceHistory', 'loading');
    try {
      const result = await this._priceHistoryService.loadPriceHistory({
        marketId: this._marketId,
        conditionId: this._requireConditionId(),
        outcomes,
        interval,
        fidelity,
      });
      if (!this._isCurrent('priceHistory', seq)) return;
      this._priceHistory = result.priceHistory;
      this._setStatus('priceHistory', result.error ? 'error' : 'ready', result.error);
      this._emitEvent('price-history-loaded', {
        marketId: this._marketId,
        priceHistory: result.priceHistory,
      });
    } catch (error) {
      if (!this._isCurrent('priceHistory', seq)) return;
      this._setStatus(
        'priceHistory',
        'error',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private _mergePriceHistory(
    current: TradingMarketSnapshot['priceHistory'],
    updates: TradingMarketSnapshot['priceHistory'],
  ): TradingMarketSnapshot['priceHistory'] {
    const merged: TradingMarketSnapshot['priceHistory'] = { ...current };
    for (const [tokenId, points] of Object.entries(updates)) {
      const byTime = new Map((merged[tokenId] ?? []).map((point) => [point.t, point]));
      for (const point of points) byTime.set(point.t, point);
      merged[tokenId] = [...byTime.values()].sort((a, b) => a.t - b.t);
    }
    return merged;
  }

  private _handlePriceHistoryUpdated(event: TradingMarketPriceHistoryUpdatedEvent): void {
    if (event.marketId !== this._marketId) return;
    this._priceHistory = this._mergePriceHistory(this._priceHistory, event.pointsByToken);
    this._emitEvent('price-history-updated', {
      marketId: this._marketId,
      interval: event.interval,
      fidelity: event.fidelity,
      pointsByToken: event.pointsByToken,
    });
  }

  private async _refreshMarketTrades(): Promise<void> {
    const conditionId = this._marketDetail?.market.conditionId;
    if (!conditionId) return;
    const seq = this._nextSeq('marketTrades');
    this._setStatus('marketTrades', 'loading');
    try {
      const result = await this._marketTradeService.refreshMarketTrades({
        marketId: this._marketId,
        conditionId,
      });
      if (!this._isCurrent('marketTrades', seq)) return;
      if (result) this._applyMarketTradeState(result);
    } catch (error) {
      if (!this._isCurrent('marketTrades', seq)) return;
      const message = error instanceof Error ? error.message : String(error);
      this._marketTrades = { ...this._marketTrades, error: message, updatedAt: this._now() };
      this._setStatus('marketTrades', 'error', message);
    }
  }

  private _resolveSelectedOutcome(): string | null {
    if (!this._selectedTokenId) return null;
    return (
      this._marketDetail?.outcomes.find((outcome) => outcome.tokenId === this._selectedTokenId)
        ?.label ?? this._selectedOutcome
    );
  }

  private _requireConditionId(): string {
    const conditionId = String(this._marketDetail?.market.conditionId || '').trim();
    if (!conditionId) throw new Error('conditionId is required');
    return conditionId;
  }

  private _emitSnapshot(): void {
    this._emitEvent('runtime-snapshot', { marketId: this._marketId, snapshot: this.snapshot() });
  }

  private _emitEvent<EventName extends TradingMarketEventName>(
    eventName: EventName,
    event: TradingMarketEventMap[EventName],
  ): void {
    const emit = this.emit as (
      eventName: EventName,
      event: TradingMarketEventMap[EventName],
    ) => boolean;
    emit.call(this, eventName, event);
  }
}

export { TradingMarketRuntimeImpl };
export type {
  TradingMarketRuntimeOptions,
  TradingMarketPriceHistoryRepositoryFactory,
  TradingMarketTradeRepositoryFactory,
  TradingMarketRuntimeTradeSync,
};
