import { EventEmitter } from 'events';
import type {
  AppLocale,
  OrderFilledActivityReorg,
  OrderFilledActivitySnapshot,
  OrderFilledActivityStartInput,
  OrderFilledActivityStatus,
  OrderFilledActivitySubscription,
  OrderFilledActivityTrade,
  OrderFilledActivityTradeSource,
} from '@polytrader/shared';
import type {
  OrderFilledActivityService,
  OrderFilledActivityServiceEventMap,
  OrderFilledActivityServiceOptions,
} from './types.js';

type JsonRecord = Record<string, unknown>;

interface ResumeState {
  cursor: string;
  reorgCursor: number | null;
}

class OrderFilledActivityServiceImpl
  extends EventEmitter<OrderFilledActivityServiceEventMap>
  implements OrderFilledActivityService
{
  private readonly _websocketUrl: string;
  private readonly _syncUrl: string;
  private readonly _maxTrades: number;
  private readonly _reconnectBaseDelayMs: number;
  private readonly _reconnectMaxDelayMs: number;
  private _socket: WebSocket | null = null;
  private _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _updateTimer: ReturnType<typeof setTimeout> | null = null;
  private _started = false;
  private _disposed = false;
  private _reconnectAttempt = 0;
  private _resumeState: ResumeState | null = null;
  private _recoveryState: ResumeState | null = null;
  private _subscription: OrderFilledActivitySubscription = {
    minTradeAmount: null,
    minTradeVolume: null,
    locale: 'en-US',
  };
  private _status: OrderFilledActivityStatus = 'idle';
  private _error: string | null = null;
  private _trades: OrderFilledActivityTrade[] = [];
  private _tradeKeys = new Set<string>();
  private _updatedAt: string | null = null;

  public constructor(options: OrderFilledActivityServiceOptions = {}) {
    super();
    this._websocketUrl = options.websocketUrl ?? 'wss://orderfilled.polytrader2.com/ws';
    this._syncUrl = options.syncUrl ?? 'https://orderfilled.polytrader2.com/v1/orderfilled/sync';
    this._maxTrades = options.maxTrades ?? 500;
    this._reconnectBaseDelayMs = options.reconnectBaseDelayMs ?? 1_000;
    this._reconnectMaxDelayMs = options.reconnectMaxDelayMs ?? 20_000;
  }

  public async start(input: OrderFilledActivityStartInput): Promise<OrderFilledActivitySnapshot> {
    this._assertNotDisposed();
    const subscription = this._normalizeSubscription(input);
    if (this._started && this._isSameSubscription(subscription)) return this.getSnapshot();

    this._stopSocket();
    this._started = true;
    this._subscription = subscription;
    this._resumeState = null;
    this._recoveryState = null;
    this._trades = [];
    this._tradeKeys.clear();
    this._error = null;
    this._reconnectAttempt = 0;
    this._setStatus('connecting');
    this._connect(false);
    return this.getSnapshot();
  }

  public stop(): void {
    this._started = false;
    this._stopSocket();
    this._resumeState = null;
    this._recoveryState = null;
    this._trades = [];
    this._tradeKeys.clear();
    this._error = null;
    this._setStatus('idle');
  }

  public dispose(): void {
    if (this._disposed) return;
    this.stop();
    this._disposed = true;
    this.removeAllListeners();
  }

  public getSnapshot(): OrderFilledActivitySnapshot {
    return {
      status: this._status,
      subscription: { ...this._subscription },
      trades: this._trades.map((trade) => ({
        ...trade,
        market: trade.market ? { ...trade.market } : null,
      })),
      error: this._error,
      updatedAt: this._updatedAt,
    };
  }

  private _assertNotDisposed(): void {
    if (this._disposed) throw new Error('Order filled activity service has been disposed');
  }

  private _normalizeSubscription(
    input: OrderFilledActivityStartInput,
  ): OrderFilledActivitySubscription {
    return {
      minTradeAmount: this._normalizeDecimal(input.minTradeAmount),
      minTradeVolume: this._normalizeDecimal(input.minTradeVolume),
      locale: this._normalizeLocale(input.locale),
    };
  }

  private _normalizeDecimal(value: string | null | undefined): string | null {
    const normalized = value?.trim() ?? '';
    if (!normalized) return null;
    if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
      throw new Error('Trade activity filters must be non-negative decimal values');
    }
    return normalized.replace(/\.(?:0+)$/, '');
  }

  private _normalizeLocale(locale: AppLocale | undefined): AppLocale {
    return locale === 'zh-CN' ? 'zh-CN' : 'en-US';
  }

  private _isSameSubscription(next: OrderFilledActivitySubscription): boolean {
    return (
      next.minTradeAmount === this._subscription.minTradeAmount &&
      next.minTradeVolume === this._subscription.minTradeVolume &&
      next.locale === this._subscription.locale
    );
  }

  private _connect(isReconnect: boolean): void {
    if (!this._started || this._disposed) return;
    this._stopSocket({ preserveReconnectTimer: true });
    this._recoveryState = isReconnect ? this._resumeState : null;
    this._setStatus(isReconnect ? 'reconnecting' : 'connecting');

    try {
      const socket = new WebSocket(this._websocketUrl);
      this._socket = socket;
      socket.onopen = () => this._handleSocketOpen(socket);
      socket.onmessage = (event) => this._handleSocketMessage(socket, event.data);
      socket.onerror = () => undefined;
      socket.onclose = () => this._handleSocketClose(socket);
    } catch (error) {
      this._handleSocketFailure(error);
    }
  }

  private _handleSocketOpen(socket: WebSocket): void {
    if (socket !== this._socket || !this._started) return;
    this._reconnectAttempt = 0;
    this._setStatus('syncing');
    this._startHeartbeat(socket);
    this._send(socket, {
      type: 'subscribe_all',
      locale: this._subscription.locale,
      ...(this._subscription.minTradeAmount
        ? { min_trade_amount: this._subscription.minTradeAmount }
        : {}),
      ...(this._subscription.minTradeVolume
        ? { min_trade_volume: this._subscription.minTradeVolume }
        : {}),
    });
  }

  private _handleSocketMessage(socket: WebSocket, payload: unknown): void {
    if (socket !== this._socket || !this._started) return;
    const message = this._parseMessage(payload);
    if (!message) return;
    const type = this._string(message.type);
    if (!type || type === 'hello' || type === 'subscriptions' || type === 'heartbeat_ack') return;

    if (type === 'orderfilled') {
      const data = this._record(message.data);
      if (!data) return;
      this._addTrade(data, this._source(message.source));
      return;
    }
    if (type === 'history_complete') {
      void this._handleHistoryComplete(message);
      return;
    }
    if (type === 'history_error') {
      this._error = this._string(message.code) ?? 'Activity history is temporarily unavailable';
      this._emitUpdated();
      return;
    }
    if (type === 'reorg') {
      const reorg = this._normalizeReorg(this._record(message.data));
      if (reorg) this._applyReorg(reorg);
      return;
    }
    if (type === 'error') {
      this._error = this._string(message.error) ?? 'Activity stream rejected the subscription';
      this._setStatus('error');
    }
  }

  private async _handleHistoryComplete(message: JsonRecord): Promise<void> {
    if (!this._started) return;
    const complete = message.complete === true;
    const nextResumeState = this._normalizeResumeState(message);
    if (!complete) {
      this._error =
        this._string(message.error_code) ?? 'Activity history is temporarily unavailable';
      this._setStatus('live');
      return;
    }

    const recoveryState = this._recoveryState;
    this._recoveryState = null;
    if (recoveryState) {
      await this._recover(recoveryState, nextResumeState);
      return;
    }
    this._resumeState = nextResumeState;
    this._setStatus('live');
  }

  private async _recover(
    recoveryState: ResumeState,
    fallbackResumeState: ResumeState | null,
  ): Promise<void> {
    try {
      let cursor = recoveryState.cursor;
      let reorgCursor = recoveryState.reorgCursor;
      let latestResumeState = fallbackResumeState;
      let hasMore = true;
      while (hasMore) {
        const response = await this._fetchCatchup(cursor, reorgCursor);
        this._applyReorgs(response.reorgs);
        for (const event of response.events) {
          const data = this._record(event.data);
          if (data) this._addTrade(data, 'catchup');
        }
        cursor = response.nextCursor || cursor;
        reorgCursor = response.reorgCursor;
        latestResumeState = response.nextCursor
          ? { cursor: response.nextCursor, reorgCursor: response.reorgCursor }
          : latestResumeState;
        hasMore = response.hasMore;
      }
      this._resumeState = latestResumeState;
      this._error = null;
    } catch (error) {
      this._error = error instanceof Error ? error.message : String(error);
      this._resumeState = fallbackResumeState;
    }
    this._setStatus('live');
  }

  private async _fetchCatchup(
    cursor: string,
    reorgCursor: number | null,
  ): Promise<{
    events: JsonRecord[];
    nextCursor: string | null;
    hasMore: boolean;
    reorgs: OrderFilledActivityReorg[];
    reorgCursor: number | null;
  }> {
    const url = new URL(this._syncUrl);
    url.searchParams.set('cursor', cursor);
    url.searchParams.set('locale', this._subscription.locale);
    if (reorgCursor !== null) url.searchParams.set('reorg_cursor', String(reorgCursor));
    if (this._subscription.minTradeAmount) {
      url.searchParams.set('min_trade_amount', this._subscription.minTradeAmount);
    }
    if (this._subscription.minTradeVolume) {
      url.searchParams.set('min_trade_volume', this._subscription.minTradeVolume);
    }

    const response = await fetch(url);
    const body = this._record(await response.json());
    if (!response.ok) {
      const message = this._string(body?.error) ?? `Activity recovery failed (${response.status})`;
      throw new Error(message);
    }
    const events = Array.isArray(body?.events)
      ? body.events.flatMap((event) => {
          const record = this._record(event);
          return record ? [record] : [];
        })
      : [];
    const reorgs = Array.isArray(body?.reorgs)
      ? body.reorgs.flatMap((item) => {
          const reorg = this._normalizeReorg(this._record(item));
          return reorg ? [reorg] : [];
        })
      : [];
    return {
      events,
      nextCursor: this._string(body?.next_cursor),
      hasMore: body?.has_more_catchup === true,
      reorgs,
      reorgCursor: this._integer(body?.reorg_cursor),
    };
  }

  private _normalizeResumeState(message: JsonRecord): ResumeState | null {
    const cursor = this._string(message.resume_cursor);
    if (!cursor) return null;
    return { cursor, reorgCursor: this._integer(message.reorg_cursor) };
  }

  private _applyReorgs(reorgs: OrderFilledActivityReorg[]): void {
    for (const reorg of reorgs) this._applyReorg(reorg);
  }

  private _normalizeReorg(input: JsonRecord | null): OrderFilledActivityReorg | null {
    if (!input) return null;
    const commonAncestorNumber = this._integer(input.common_ancestor_number);
    if (commonAncestorNumber === null) return null;
    return {
      commonAncestorNumber,
      newHeadNumber: this._integer(input.new_head_number),
    };
  }

  private _applyReorg(reorg: OrderFilledActivityReorg): void {
    const nextTrades = this._trades.filter(
      (trade) => trade.blockNumber <= reorg.commonAncestorNumber,
    );
    if (nextTrades.length === this._trades.length) return;
    this._trades = nextTrades;
    this._tradeKeys = new Set(nextTrades.map((trade) => trade.id));
    this._scheduleUpdated();
  }

  private _addTrade(data: JsonRecord, source: OrderFilledActivityTradeSource): void {
    const trade = this._normalizeTrade(data, source);
    if (!trade || this._tradeKeys.has(trade.id)) return;
    this._tradeKeys.add(trade.id);
    this._trades.push(trade);
    this._trades.sort((left, right) => {
      if (right.blockNumber !== left.blockNumber) return right.blockNumber - left.blockNumber;
      return right.logIndex - left.logIndex;
    });
    if (this._trades.length > this._maxTrades) {
      const discarded = this._trades.splice(this._maxTrades);
      for (const item of discarded) this._tradeKeys.delete(item.id);
    }
    this._scheduleUpdated();
  }

  private _normalizeTrade(
    data: JsonRecord,
    source: OrderFilledActivityTradeSource,
  ): OrderFilledActivityTrade | null {
    const blockHash = this._string(data.block_hash);
    const transactionHash = this._string(data.transaction_hash);
    const logIndex = this._integer(data.log_index);
    const blockNumber = this._integer(data.block_number);
    if (!blockHash || !transactionHash || logIndex === null || blockNumber === null) return null;

    const makerAssetId = this._string(data.maker_asset_id);
    const takerAssetId = this._string(data.taker_asset_id);
    const isMakerBuying = makerAssetId === '0';
    const outcomeAmount = isMakerBuying
      ? this._formatUsdc(data.taker_amount_filled)
      : this._formatUsdc(data.maker_amount_filled);
    const tradeAmount = isMakerBuying
      ? this._formatUsdc(data.maker_amount_filled)
      : this._formatUsdc(data.taker_amount_filled);
    const price = this._divideUsdc(
      isMakerBuying ? data.maker_amount_filled : data.taker_amount_filled,
      isMakerBuying ? data.taker_amount_filled : data.maker_amount_filled,
    );
    const market = this._normalizeMarket(this._record(data.market));
    const timestamp = this._integer(data.timestamp);

    return {
      id: `${blockHash}:${transactionHash}:${logIndex}`,
      source,
      chainId: this._integer(data.chain_id),
      blockNumber,
      blockHash,
      timestamp,
      transactionHash,
      logIndex,
      contract: this._string(data.contract),
      traderAddress: this._string(data.maker),
      counterpartyAddress: this._string(data.taker),
      direction: makerAssetId === null ? null : isMakerBuying ? 'BUY' : 'SELL',
      tokenId: takerAssetId === '0' ? null : takerAssetId,
      price,
      volume: outcomeAmount,
      amount: tradeAmount,
      market,
    };
  }

  private _normalizeMarket(input: JsonRecord | null): OrderFilledActivityTrade['market'] {
    if (!input) return null;
    return {
      id: this._string(input.id),
      conditionId: this._string(input.condition_id),
      eventId: this._string(input.event_id),
      question: this._string(input.question),
      outcome: this._string(input.outcome),
      outcomeIndex: this._integer(input.outcome_index),
      icon: this._string(input.icon),
      image: this._string(input.image),
    };
  }

  private _formatUsdc(value: unknown): string | null {
    const integer = this._bigInt(value);
    if (integer === null) return null;
    return this._formatScaled(integer, 6);
  }

  private _divideUsdc(numerator: unknown, denominator: unknown): string | null {
    const numeratorValue = this._bigInt(numerator);
    const denominatorValue = this._bigInt(denominator);
    if (numeratorValue === null || denominatorValue === null || denominatorValue === 0n)
      return null;
    const precision = 6n;
    const scale = 10n ** precision;
    const scaled = (numeratorValue * scale) / denominatorValue;
    return this._formatScaled(scaled, Number(precision));
  }

  private _formatScaled(value: bigint, decimals: number): string {
    const scale = 10n ** BigInt(decimals);
    const integer = value / scale;
    const fraction = (value % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
    return fraction ? `${integer}.${fraction}` : integer.toString();
  }

  private _bigInt(value: unknown): bigint | null {
    const text = this._string(value);
    if (!text || !/^\d+$/.test(text)) return null;
    try {
      return BigInt(text);
    } catch {
      return null;
    }
  }

  private _source(value: unknown): OrderFilledActivityTradeSource {
    return value === 'history' || value === 'catchup' ? value : 'live';
  }

  private _parseMessage(payload: unknown): JsonRecord | null {
    try {
      const text = typeof payload === 'string' ? payload : String(payload);
      return this._record(JSON.parse(text));
    } catch {
      return null;
    }
  }

  private _record(value: unknown): JsonRecord | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as JsonRecord;
  }

  private _string(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private _integer(value: unknown): number | null {
    const number = typeof value === 'number' ? value : Number(value);
    return Number.isSafeInteger(number) ? number : null;
  }

  private _send(socket: WebSocket, message: JsonRecord): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(message));
  }

  private _startHeartbeat(socket: WebSocket): void {
    this._stopHeartbeat();
    this._heartbeatTimer = setInterval(() => {
      if (socket !== this._socket || !this._started) return;
      this._send(socket, { type: 'heartbeat' });
    }, 10_000);
  }

  private _stopHeartbeat(): void {
    if (!this._heartbeatTimer) return;
    clearInterval(this._heartbeatTimer);
    this._heartbeatTimer = null;
  }

  private _handleSocketClose(socket: WebSocket): void {
    if (socket !== this._socket) return;
    this._socket = null;
    this._stopHeartbeat();
    if (!this._started || this._disposed) return;
    this._scheduleReconnect();
  }

  private _handleSocketFailure(error: unknown): void {
    this._socket = null;
    this._error = error instanceof Error ? error.message : String(error);
    this._scheduleReconnect();
  }

  private _scheduleReconnect(): void {
    if (!this._started || this._disposed || this._reconnectTimer) return;
    const delay = Math.min(
      this._reconnectBaseDelayMs * 2 ** this._reconnectAttempt,
      this._reconnectMaxDelayMs,
    );
    this._reconnectAttempt += 1;
    this._setStatus('reconnecting');
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._connect(true);
    }, delay);
  }

  private _stopSocket(options: { preserveReconnectTimer?: boolean } = {}): void {
    if (!options.preserveReconnectTimer && this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._stopHeartbeat();
    const socket = this._socket;
    this._socket = null;
    if (!socket) return;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
      socket.close();
  }

  private _setStatus(status: OrderFilledActivityStatus): void {
    this._status = status;
    this._updatedAt = new Date().toISOString();
    this._emitUpdated();
  }

  private _scheduleUpdated(): void {
    this._updatedAt = new Date().toISOString();
    if (this._updateTimer) return;
    this._updateTimer = setTimeout(() => {
      this._updateTimer = null;
      this._emitUpdated();
    }, 100);
  }

  private _emitUpdated(): void {
    if (this._updateTimer) {
      clearTimeout(this._updateTimer);
      this._updateTimer = null;
    }
    this.emit('updated', this.getSnapshot());
  }
}

export { OrderFilledActivityServiceImpl };
