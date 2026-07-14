import { EventEmitter } from 'events';
import type {
  BinanceKline,
  BinanceTradeTick,
  TradingRuntimeBinanceKlineState,
  TradingRuntimeCryptoTickStatus,
} from '@polytrader/shared';
import type { TradingBinanceKlineEventMap } from './tradingBinanceKlineEvents.js';
import type {
  TradingBinanceKlineClient,
  TradingBinanceKlineClientOptions,
  TradingBinanceKlineStartInput,
} from './types.js';

const DEFAULT_SPOT_HTTP_BASE_URL = 'https://data-api.binance.vision';
const DEFAULT_SPOT_WS_URL = 'wss://stream.binance.com:9443/ws';
const DEFAULT_FUTURES_HTTP_BASE_URL = 'https://fapi.binance.com';
const DEFAULT_FUTURES_WS_URL = 'wss://fstream.binance.com/ws';
const DEFAULT_RECONNECT_DELAY_MS = 2_000;
const DEFAULT_EMIT_THROTTLE_MS = 200;
const DEFAULT_FUTURES_POLL_MS = 2_000;

type BinanceRestKline = [number, string, string, string, string, string, number, ...unknown[]];

interface BinanceWebSocketKline {
  t?: number;
  T?: number;
  s?: string;
  i?: string;
  o?: string;
  h?: string;
  l?: string;
  c?: string;
  v?: string;
  x?: boolean;
}

interface BinanceWebSocketMessage {
  e?: string;
  s?: string;
  p?: string;
  q?: string;
  T?: number;
  k?: BinanceWebSocketKline;
}

class TradingBinanceKlineClientImpl
  extends EventEmitter<TradingBinanceKlineEventMap>
  implements TradingBinanceKlineClient
{
  private readonly _spotHttpBaseUrl: string;
  private readonly _spotWsUrl: string;
  private readonly _futuresHttpBaseUrl: string;
  private readonly _futuresWsUrl: string;
  private readonly _reconnectDelayMs: number;
  private readonly _emitThrottleMs: number;
  private readonly _futuresPollMs: number;
  private _state: TradingRuntimeBinanceKlineState | null = null;
  private _input: TradingBinanceKlineStartInput | null = null;
  private _ws: WebSocket | null = null;
  private _connectionId = 0;
  private _disposed = false;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _startTimer: ReturnType<typeof setTimeout> | null = null;
  private _endTimer: ReturnType<typeof setTimeout> | null = null;
  private _emitTimer: ReturnType<typeof setTimeout> | null = null;
  private _futuresPollTimer: ReturnType<typeof setInterval> | null = null;
  private _futuresPollInFlight = false;
  private _lastEmitAt = 0;

  public constructor(options: TradingBinanceKlineClientOptions = {}) {
    super();
    this._spotHttpBaseUrl = this._normalizeBaseUrl(
      options.spotHttpBaseUrl ?? DEFAULT_SPOT_HTTP_BASE_URL,
    );
    this._spotWsUrl = options.spotWsUrl ?? DEFAULT_SPOT_WS_URL;
    this._futuresHttpBaseUrl = this._normalizeBaseUrl(
      options.futuresHttpBaseUrl ?? DEFAULT_FUTURES_HTTP_BASE_URL,
    );
    this._futuresWsUrl = options.futuresWsUrl ?? DEFAULT_FUTURES_WS_URL;
    this._reconnectDelayMs = options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS;
    this._emitThrottleMs = options.emitThrottleMs ?? DEFAULT_EMIT_THROTTLE_MS;
    this._futuresPollMs = options.futuresPollMs ?? DEFAULT_FUTURES_POLL_MS;
  }

  public start(input: TradingBinanceKlineStartInput): void {
    const normalizedInput = this._normalizeInput(input);
    if (!normalizedInput) {
      this._replaceState(this._createErrorState(input, 'Binance Kline input is invalid'));
      return;
    }
    if (
      this._input &&
      this._inputKey(this._input) === this._inputKey(normalizedInput) &&
      this._state?.status !== 'error'
    ) {
      return;
    }

    this._input = normalizedInput;
    this._disposed = false;
    this._connectionId += 1;
    this._clearTimers();
    this._disconnect();
    this._replaceState(this._createState(normalizedInput, 'loading'));
    this._startCurrentInput(normalizedInput, this._connectionId);
  }

  public snapshot(): TradingRuntimeBinanceKlineState | null {
    return this._state ? this._cloneState(this._state) : null;
  }

  public dispose(): void {
    this._disposed = true;
    this._connectionId += 1;
    this._clearTimers();
    this._disconnect();
    this.removeAllListeners();
  }

  private _startCurrentInput(input: TradingBinanceKlineStartInput, connectionId: number): void {
    const startMs = Date.parse(input.window.startTime);
    const endMs = Date.parse(input.window.endTime);
    const nowMs = Date.now();
    if (input.window.closed || endMs <= nowMs) {
      void this._loadHistory(input, connectionId, true);
      return;
    }
    if (startMs > nowMs) {
      this._scheduleStart(input, connectionId, startMs - nowMs);
      return;
    }
    this._connect(input, connectionId);
    this._startFuturesPolling(input, connectionId);
    this._scheduleEnd(input, connectionId, endMs - nowMs);
    void this._loadHistory(input, connectionId, false);
  }

  private _scheduleStart(
    input: TradingBinanceKlineStartInput,
    connectionId: number,
    delayMs: number,
  ): void {
    this._startTimer = setTimeout(
      () => {
        this._startTimer = null;
        if (!this._isCurrent(connectionId)) return;
        this._connect(input, connectionId);
        this._startFuturesPolling(input, connectionId);
        this._scheduleEnd(input, connectionId, Date.parse(input.window.endTime) - Date.now());
        void this._loadHistory(input, connectionId, false);
      },
      Math.max(0, delayMs),
    );
  }

  private _scheduleEnd(
    input: TradingBinanceKlineStartInput,
    connectionId: number,
    delayMs: number,
  ): void {
    this._endTimer = setTimeout(
      () => {
        this._endTimer = null;
        if (!this._isCurrent(connectionId)) return;
        this._disconnect();
        this._stopFuturesPolling();
        void this._loadHistory(input, connectionId, true);
      },
      Math.max(0, delayMs),
    );
  }

  private async _loadHistory(
    input: TradingBinanceKlineStartInput,
    connectionId: number,
    closed: boolean,
  ): Promise<void> {
    try {
      const [candles, referenceCandles] = await Promise.all([
        this._fetchKlines(input, '1m'),
        this._fetchKlines(input, '1h'),
      ]);
      if (!this._isCurrent(connectionId)) return;
      const current = this._state ?? this._createState(input, 'loading');
      this._state = {
        ...current,
        status: closed ? 'closed' : 'live',
        candles: this._mergeCandles(current.candles, candles),
        referenceCandle:
          referenceCandles[0] ??
          current.referenceCandle ??
          this._buildReferenceFromMinutes(candles),
        latestTrade: closed ? null : current.latestTrade,
        error: '',
        updatedAt: new Date().toISOString(),
      };
      this._emitChanged(true);
    } catch (error) {
      if (!this._isCurrent(connectionId)) return;
      const current = this._state ?? this._createState(input, 'loading');
      this._state = {
        ...current,
        status:
          current.candles.length || current.latestTrade ? (closed ? 'closed' : 'live') : 'error',
        error: this._errorMessage(error),
        updatedAt: new Date().toISOString(),
      };
      this._emitChanged(true);
    }
  }

  private async _fetchKlines(
    input: TradingBinanceKlineStartInput,
    interval: '1m' | '1h',
  ): Promise<BinanceKline[]> {
    const baseUrl = input.venue === 'spot' ? this._spotHttpBaseUrl : this._futuresHttpBaseUrl;
    const path = input.venue === 'spot' ? '/api/v3/klines' : '/fapi/v1/klines';
    const url = new URL(`${baseUrl}${path}`);
    url.searchParams.set('symbol', input.symbol);
    url.searchParams.set('interval', interval);
    url.searchParams.set('startTime', String(Date.parse(input.window.startTime)));
    url.searchParams.set('endTime', String(Date.parse(input.window.endTime) - 1));
    url.searchParams.set('limit', interval === '1m' ? '60' : '1');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Binance HTTP ${response.status}: ${await response.text()}`);
    const payload = (await response.json()) as BinanceRestKline[];
    return payload
      .map((item) => this._normalizeRestKline(item, input, interval))
      .filter((item): item is BinanceKline => item !== null);
  }

  private _connect(input: TradingBinanceKlineStartInput, connectionId: number): void {
    if (this._disposed || !this._isCurrent(connectionId)) return;
    this._disconnect();
    const ws = new WebSocket(input.venue === 'spot' ? this._spotWsUrl : this._futuresWsUrl);
    this._ws = ws;
    ws.addEventListener('open', () => {
      if (!this._isCurrent(connectionId)) return;
      const symbol = input.symbol.toLowerCase();
      ws.send(
        JSON.stringify({
          method: 'SUBSCRIBE',
          params: [`${symbol}@kline_1m`, `${symbol}@kline_1h`, `${symbol}@aggTrade`],
          id: connectionId,
        }),
      );
    });
    ws.addEventListener('message', (event) => {
      if (!this._isCurrent(connectionId)) return;
      this._handleMessage(input, String(event.data));
    });
    ws.addEventListener('error', () => {
      if (!this._isCurrent(connectionId) || !this._state) return;
      this._state = { ...this._state, error: 'Binance WebSocket error' };
      this._emitChanged();
    });
    ws.addEventListener('close', () => {
      if (!this._isCurrent(connectionId) || this._disposed) return;
      if (this._ws !== ws) return;
      this._ws = null;
      if (Date.now() >= Date.parse(input.window.endTime)) return;
      this._reconnectTimer = setTimeout(() => {
        this._reconnectTimer = null;
        this._connect(input, connectionId);
      }, this._reconnectDelayMs);
    });
  }

  private _startFuturesPolling(input: TradingBinanceKlineStartInput, connectionId: number): void {
    if (input.venue !== 'usdm-futures' || this._futuresPollTimer) return;
    this._futuresPollTimer = setInterval(() => {
      if (!this._isCurrent(connectionId) || this._futuresPollInFlight) return;
      if (Date.now() >= Date.parse(input.window.endTime)) return;
      this._futuresPollInFlight = true;
      void this._loadHistory(input, connectionId, false).finally(() => {
        this._futuresPollInFlight = false;
      });
    }, this._futuresPollMs);
  }

  private _stopFuturesPolling(): void {
    if (this._futuresPollTimer) clearInterval(this._futuresPollTimer);
    this._futuresPollTimer = null;
    this._futuresPollInFlight = false;
  }

  private _handleMessage(input: TradingBinanceKlineStartInput, raw: string): void {
    const message = this._parseMessage(raw);
    if (!message || !this._state) return;
    if (message.e === 'kline' && message.k) {
      const candle = this._normalizeWsKline(message.k, input);
      if (!candle || !this._isInWindow(candle.openTime, input)) return;
      this._state =
        candle.interval === '1h'
          ? { ...this._state, referenceCandle: candle, status: 'live', error: '' }
          : {
              ...this._state,
              candles: this._mergeCandles(this._state.candles, [candle]),
              status: 'live',
              error: '',
            };
      this._state.updatedAt = new Date().toISOString();
      this._emitChanged();
      return;
    }
    if (message.e === 'aggTrade') {
      const trade = this._normalizeTrade(message, input);
      if (!trade) return;
      const tradeMs = Date.parse(trade.tradeTime);
      if (
        tradeMs < Date.parse(input.window.startTime) ||
        tradeMs >= Date.parse(input.window.endTime)
      ) {
        return;
      }
      this._state = {
        ...this._state,
        latestTrade: trade,
        status: 'live',
        error: '',
        updatedAt: new Date().toISOString(),
      };
      this._emitChanged();
    }
  }

  private _normalizeRestKline(
    item: BinanceRestKline,
    input: TradingBinanceKlineStartInput,
    interval: '1m' | '1h',
  ): BinanceKline | null {
    const [openTime, open, high, low, close, volume, closeTime] = item;
    if (![open, high, low, close, volume].every((value) => typeof value === 'string')) return null;
    if (!Number.isFinite(openTime) || !Number.isFinite(closeTime)) return null;
    return {
      source: 'binance',
      venue: input.venue,
      symbol: input.symbol,
      interval,
      openTime: new Date(openTime).toISOString(),
      closeTime: new Date(closeTime).toISOString(),
      open,
      high,
      low,
      close,
      volume,
      closed: closeTime < Date.now(),
    };
  }

  private _normalizeWsKline(
    item: BinanceWebSocketKline,
    input: TradingBinanceKlineStartInput,
  ): BinanceKline | null {
    if (item.i !== '1m' && item.i !== '1h') return null;
    if (!Number.isFinite(item.t) || !Number.isFinite(item.T)) return null;
    if (![item.o, item.h, item.l, item.c, item.v].every((value) => typeof value === 'string')) {
      return null;
    }
    return {
      source: 'binance',
      venue: input.venue,
      symbol: input.symbol,
      interval: item.i,
      openTime: new Date(item.t!).toISOString(),
      closeTime: new Date(item.T!).toISOString(),
      open: item.o!,
      high: item.h!,
      low: item.l!,
      close: item.c!,
      volume: item.v!,
      closed: item.x === true,
    };
  }

  private _normalizeTrade(
    item: BinanceWebSocketMessage,
    input: TradingBinanceKlineStartInput,
  ): BinanceTradeTick | null {
    if (typeof item.p !== 'string' || typeof item.q !== 'string' || !Number.isFinite(item.T)) {
      return null;
    }
    return {
      source: 'binance',
      venue: input.venue,
      symbol: input.symbol,
      price: item.p,
      quantity: item.q,
      tradeTime: new Date(item.T!).toISOString(),
    };
  }

  private _buildReferenceFromMinutes(candles: BinanceKline[]): BinanceKline | null {
    if (!candles.length || !this._input) return null;
    const sorted = [...candles].sort(
      (left, right) => Date.parse(left.openTime) - Date.parse(right.openTime),
    );
    const first = sorted[0];
    const last = sorted.at(-1)!;
    return {
      source: 'binance',
      venue: this._input.venue,
      symbol: this._input.symbol,
      interval: '1h',
      openTime: this._input.window.startTime,
      closeTime: new Date(Date.parse(this._input.window.endTime) - 1).toISOString(),
      open: first.open,
      high: this._maxDecimal(sorted.map((item) => item.high)),
      low: this._minDecimal(sorted.map((item) => item.low)),
      close: last.close,
      volume: String(sorted.reduce((total, item) => total + Number(item.volume), 0)),
      closed: Date.now() >= Date.parse(this._input.window.endTime),
    };
  }

  private _mergeCandles(current: BinanceKline[], incoming: BinanceKline[]): BinanceKline[] {
    const byTime = new Map(current.map((item) => [item.openTime, item]));
    for (const candle of incoming) byTime.set(candle.openTime, candle);
    return [...byTime.values()]
      .sort((left, right) => Date.parse(left.openTime) - Date.parse(right.openTime))
      .slice(-60);
  }

  private _replaceState(state: TradingRuntimeBinanceKlineState): void {
    this._state = state;
    this._emitChanged(true);
  }

  private _emitChanged(immediate = false): void {
    if (!this._state) return;
    const elapsed = Date.now() - this._lastEmitAt;
    if (immediate || elapsed >= this._emitThrottleMs) {
      if (this._emitTimer) clearTimeout(this._emitTimer);
      this._emitTimer = null;
      this._lastEmitAt = Date.now();
      this.emit('binance-kline-changed', this._cloneState(this._state));
      return;
    }
    if (this._emitTimer) return;
    this._emitTimer = setTimeout(() => {
      this._emitTimer = null;
      this._emitChanged(true);
    }, this._emitThrottleMs - elapsed);
  }

  private _createState(
    input: TradingBinanceKlineStartInput,
    status: TradingRuntimeCryptoTickStatus,
  ): TradingRuntimeBinanceKlineState {
    return {
      enabled: true,
      source: 'binance',
      venue: input.venue,
      symbol: input.symbol,
      status,
      referenceStartTime: input.window.startTime,
      referenceEndTime: input.window.endTime,
      candles: [],
      referenceCandle: null,
      latestTrade: null,
      error: '',
      updatedAt: new Date().toISOString(),
    };
  }

  private _createErrorState(
    input: TradingBinanceKlineStartInput,
    error: string,
  ): TradingRuntimeBinanceKlineState {
    return {
      ...this._createState(input, 'error'),
      error,
    };
  }

  private _cloneState(state: TradingRuntimeBinanceKlineState): TradingRuntimeBinanceKlineState {
    return {
      ...state,
      candles: state.candles.map((item) => ({ ...item })),
      referenceCandle: state.referenceCandle ? { ...state.referenceCandle } : null,
      latestTrade: state.latestTrade ? { ...state.latestTrade } : null,
    };
  }

  private _normalizeInput(
    input: TradingBinanceKlineStartInput,
  ): TradingBinanceKlineStartInput | null {
    const symbol = input.symbol
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    const startMs = Date.parse(input.window.startTime);
    const endMs = Date.parse(input.window.endTime);
    if (!symbol || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      return null;
    }
    return { ...input, symbol };
  }

  private _inputKey(input: TradingBinanceKlineStartInput): string {
    return [
      input.marketId,
      input.venue,
      input.symbol,
      input.window.startTime,
      input.window.endTime,
      input.window.closed ? 'closed' : 'live',
    ].join('|');
  }

  private _isCurrent(connectionId: number): boolean {
    return !this._disposed && connectionId === this._connectionId;
  }

  private _isInWindow(openTime: string, input: TradingBinanceKlineStartInput): boolean {
    const time = Date.parse(openTime);
    return time >= Date.parse(input.window.startTime) && time < Date.parse(input.window.endTime);
  }

  private _parseMessage(raw: string): BinanceWebSocketMessage | null {
    try {
      const parsed = JSON.parse(raw) as BinanceWebSocketMessage;
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  private _disconnect(): void {
    const ws = this._ws;
    this._ws = null;
    if (ws && ws.readyState < WebSocket.CLOSING) ws.close();
  }

  private _clearTimers(): void {
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    if (this._startTimer) clearTimeout(this._startTimer);
    if (this._endTimer) clearTimeout(this._endTimer);
    if (this._emitTimer) clearTimeout(this._emitTimer);
    this._stopFuturesPolling();
    this._reconnectTimer = null;
    this._startTimer = null;
    this._endTimer = null;
    this._emitTimer = null;
  }

  private _normalizeBaseUrl(url: string): string {
    return url.replace(/\/+$/, '');
  }

  private _maxDecimal(values: string[]): string {
    return values.reduce((current, value) => (Number(value) > Number(current) ? value : current));
  }

  private _minDecimal(values: string[]): string {
    return values.reduce((current, value) => (Number(value) < Number(current) ? value : current));
  }

  private _errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

function createTradingBinanceKlineClient(
  options: TradingBinanceKlineClientOptions = {},
): TradingBinanceKlineClient {
  return new TradingBinanceKlineClientImpl(options);
}

export { TradingBinanceKlineClientImpl, createTradingBinanceKlineClient };
