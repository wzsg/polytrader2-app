import { EventEmitter } from 'events';
import type { CryptoTick, TradingRuntimeCryptoTickState } from '@polytrader/shared';
import type { TradingCryptoTickEventMap } from './tradingCryptoTickEvents.js';
import type {
  TradingCryptoTickClient,
  TradingCryptoTickClientOptions,
  TradingCryptoTickStartInput,
} from './types.js';

const DEFAULT_HTTP_BASE_URL = 'https://tick.polytrader2.com';
const DEFAULT_WS_URL = 'wss://tick.polytrader2.com/v1/ws';
const DEFAULT_HISTORY_LIMIT = 10_000;
const DEFAULT_HEARTBEAT_MS = 10_000;
const DEFAULT_RECONNECT_DELAY_MS = 2_000;
const MAX_TICKS = 10_000;
const DISPLAY_WINDOW_RETRY_DELAY_MS = 2_000;
const DISPLAY_WINDOW_RETRY_GRACE_MS = 15_000;

interface TickApiItem {
  source?: string;
  symbol?: string;
  raw_symbol?: string;
  price?: number;
  event_time?: string;
  ws_time?: string;
  ingested_at?: string;
  dedup_key?: string | number;
}

interface TickRangeResponse {
  ticks?: TickApiItem[];
  next_cursor?: string | null;
}

interface TickSnapshotMessage {
  type: 'snapshot';
  symbol?: string;
  ticks?: TickApiItem[];
}

interface TickMessage {
  type: 'tick';
  symbol?: string;
  tick?: TickApiItem;
}

type WebSocketLike = WebSocket;

class TradingCryptoTickClientImpl
  extends EventEmitter<TradingCryptoTickEventMap>
  implements TradingCryptoTickClient
{
  private readonly _httpBaseUrl: string;
  private readonly _wsUrl: string;
  private readonly _historyLimit: number;
  private readonly _heartbeatMs: number;
  private readonly _reconnectDelayMs: number;
  private _state: TradingRuntimeCryptoTickState | null = null;
  private _input: TradingCryptoTickStartInput | null = null;
  private _ws: WebSocketLike | null = null;
  private _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _displayEndTimer: ReturnType<typeof setTimeout> | null = null;
  private _displayWindowRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private _connectionId = 0;
  private _disposed = false;
  private _closedMode = false;

  public constructor(options: TradingCryptoTickClientOptions = {}) {
    super();
    this._httpBaseUrl = this._normalizeBaseUrl(options.httpBaseUrl ?? DEFAULT_HTTP_BASE_URL);
    this._wsUrl = options.wsUrl ?? DEFAULT_WS_URL;
    this._historyLimit = options.historyLimit ?? DEFAULT_HISTORY_LIMIT;
    this._heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
    this._reconnectDelayMs = options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS;
  }

  public start(input: TradingCryptoTickStartInput): void {
    const symbol = this._normalizeSymbol(input.symbol);
    if (!symbol) {
      this._setState(this._createState('', 'error', [], 'Crypto tick symbol is required'));
      return;
    }

    const nextInput: TradingCryptoTickStartInput = { ...input, symbol };
    const sameInput = this._input && this._inputKey(this._input) === this._inputKey(nextInput);
    if (sameInput && this._state?.status !== 'error') return;

    this._input = nextInput;
    this._connectionId += 1;
    this._clearDisplayEndTimer();
    this._clearDisplayWindowRetryTimer();
    this._disconnect();
    this._setState(this._createState(symbol, 'loading', []));

    if (nextInput.window.closed) {
      this._closedMode = true;
      void this._loadClosedRange(nextInput, this._connectionId);
      return;
    }

    this._closedMode = false;
    this._connect(nextInput, this._connectionId);
  }

  public snapshot(): TradingRuntimeCryptoTickState | null {
    if (!this._state) return null;
    return this._cloneState(this._state);
  }

  public dispose(): void {
    this._disposed = true;
    this._connectionId += 1;
    this._clearDisplayEndTimer();
    this._clearDisplayWindowRetryTimer();
    this._disconnect();
    this.removeAllListeners();
  }

  private _normalizeBaseUrl(url: string): string {
    return url.replace(/\/+$/, '');
  }

  private _normalizeSymbol(symbol: string): string {
    return symbol
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  private _inputKey(input: TradingCryptoTickStartInput): string {
    return [
      input.marketId,
      input.symbol,
      input.window.closed ? 'closed' : 'live',
      input.window.endTime ?? '',
      input.window.displayStartTime ?? '',
      input.window.displayEndTime ?? '',
    ].join('|');
  }

  private _createState(
    symbol: string,
    status: TradingRuntimeCryptoTickState['status'],
    ticks: CryptoTick[],
    error = '',
  ): TradingRuntimeCryptoTickState {
    const normalizedTicks = this._mergeTicks([], ticks);
    return {
      enabled: true,
      source: 'chainlink',
      symbol,
      status,
      referenceStartTime: this._input?.window.startTime ?? null,
      referenceEndTime: this._input?.window.endTime ?? null,
      displayStartTime: this._input?.window.displayStartTime ?? null,
      displayEndTime: this._input?.window.displayEndTime ?? null,
      ticks: normalizedTicks,
      latestTick: normalizedTicks.at(-1) ?? null,
      error,
      updatedAt: this._now(),
    };
  }

  private _setState(state: TradingRuntimeCryptoTickState): void {
    this._state = this._cloneState(state);
    this.emit('crypto-tick-changed', this._cloneState(state));
  }

  private _applyTicks(
    ticks: CryptoTick[],
    status: TradingRuntimeCryptoTickState['status'],
    error = '',
  ): void {
    const current = this._state;
    const merged = this._mergeTicks(current?.ticks ?? [], ticks);
    this._setState({
      enabled: true,
      source: 'chainlink',
      symbol: current?.symbol ?? ticks[0]?.symbol ?? '',
      status,
      referenceStartTime: current?.referenceStartTime ?? this._input?.window.startTime ?? null,
      referenceEndTime: current?.referenceEndTime ?? this._input?.window.endTime ?? null,
      displayStartTime: current?.displayStartTime ?? this._input?.window.displayStartTime ?? null,
      displayEndTime: current?.displayEndTime ?? this._input?.window.displayEndTime ?? null,
      ticks: merged,
      latestTick: merged.at(-1) ?? null,
      error,
      updatedAt: this._now(),
    });
  }

  private _mergeTicks(existing: CryptoTick[], incoming: CryptoTick[]): CryptoTick[] {
    const byKey = new Map<string, CryptoTick>();
    for (const tick of this._filterDisplayTicks([...existing, ...incoming])) {
      byKey.set(this._tickKey(tick), tick);
    }
    return [...byKey.values()]
      .sort((a, b) => Date.parse(a.eventTime) - Date.parse(b.eventTime))
      .slice(-MAX_TICKS);
  }

  private _tickKey(tick: CryptoTick): string {
    return tick.dedupKey || `${tick.symbol}:${tick.eventTime}:${tick.price}`;
  }

  private async _loadClosedRange(
    input: TradingCryptoTickStartInput,
    connectionId: number,
  ): Promise<void> {
    try {
      const displayStartMs = this._parseTime(input.window.displayStartTime);
      const displayEndMs = this._parseTime(input.window.displayEndTime);
      if (!displayStartMs || !displayEndMs) throw new Error('Crypto tick display window is required');
      const start = Math.floor(displayStartMs / 1000);
      const end = Math.floor(displayEndMs / 1000);
      const ticks = await this._fetchRange(input.symbol, start, end);
      if (!this._isCurrent(connectionId)) return;
      this._applyTicks(ticks, 'closed');
      if (!this._hasDisplayEndTick(input)) {
        this._scheduleDisplayWindowRetry(input, connectionId);
      }
    } catch (error) {
      if (!this._isCurrent(connectionId)) return;
      this._applyTicks([], 'error', this._errorMessage(error));
    }
  }

  private _connect(input: TradingCryptoTickStartInput, connectionId: number): void {
    if (this._disposed || input.window.closed) return;
    if (this._isDisplayWindowFinished(input)) {
      this._applyTicks([], 'closed');
      this._closedMode = true;
      return;
    }
    this._disconnect();
    this._scheduleDisplayEndStop(input, connectionId);

    const ws = new WebSocket(this._wsUrl);
    this._ws = ws;

    ws.addEventListener('open', () => {
      if (!this._isCurrent(connectionId)) return;
      ws.send(JSON.stringify({ action: 'subscribe', symbol: input.symbol }));
      this._startHeartbeat(ws, connectionId);
    });

    ws.addEventListener('message', (event) => {
      if (!this._isCurrent(connectionId)) return;
      void this._handleWsMessage(input, connectionId, String(event.data));
    });

    ws.addEventListener('error', () => {
      if (!this._isCurrent(connectionId)) return;
      this._applyTicks([], 'error', 'Crypto tick WebSocket error');
    });

    ws.addEventListener('close', () => {
      if (!this._isCurrent(connectionId) || this._disposed || this._closedMode) return;
      this._stopHeartbeat();
      this._scheduleReconnect(input, connectionId);
    });
  }

  private async _handleWsMessage(
    input: TradingCryptoTickStartInput,
    connectionId: number,
    raw: string,
  ): Promise<void> {
    const parsed = this._parseJson(raw);
    if (!parsed || typeof parsed !== 'object') return;

    const type = String((parsed as { type?: unknown }).type || '');
    if (type === 'pong') return;
    if (type === 'snapshot') {
      const message = parsed as TickSnapshotMessage;
      const ticks = this._normalizeTicks(message.ticks ?? [], input.symbol);
      this._applyTicks(ticks, 'live');
      await this._loadLiveHistory(input, connectionId, ticks);
      return;
    }
    if (type === 'tick') {
      const message = parsed as TickMessage;
      const tick = message.tick ? this._normalizeTick(message.tick, input.symbol) : null;
      if (tick) this._applyTicks([tick], 'live');
    }
  }

  private async _loadLiveHistory(
    input: TradingCryptoTickStartInput,
    connectionId: number,
    snapshotTicks: CryptoTick[],
  ): Promise<void> {
    try {
      const endMs = this._liveHistoryEndMs(input, snapshotTicks);
      const startMs = this._liveHistoryStartMs(input, endMs);
      if (!startMs || !endMs || startMs >= endMs) return;
      const ticks = await this._fetchRange(
        input.symbol,
        Math.floor(startMs / 1000),
        Math.floor(endMs / 1000),
      );
      if (!this._isCurrent(connectionId)) return;
      this._applyTicks(ticks, 'live');
    } catch (error) {
      if (!this._isCurrent(connectionId)) return;
      this._applyTicks([], 'error', this._errorMessage(error));
    }
  }

  private _liveHistoryEndMs(
    input: TradingCryptoTickStartInput,
    snapshotTicks: CryptoTick[],
  ): number {
    const snapshotMs = snapshotTicks
      .map((tick) => Date.parse(tick.eventTime))
      .filter((time) => Number.isFinite(time))
      .sort((a, b) => b - a)[0];
    const fallbackMs = this._parseTime(input.window.endTime) ?? Date.now();
    const displayEndMs = this._parseTime(input.window.displayEndTime);
    const endMs = snapshotMs ?? fallbackMs;
    return displayEndMs ? Math.min(endMs, displayEndMs) : endMs;
  }

  private _liveHistoryStartMs(input: TradingCryptoTickStartInput, endMs: number): number {
    return this._parseTime(input.window.displayStartTime) ?? endMs;
  }

  private async _fetchRange(symbol: string, start: number, end: number): Promise<CryptoTick[]> {
    const ticks: CryptoTick[] = [];
    let cursor = '';
    do {
      const url = new URL(`${this._httpBaseUrl}/v1/ticks/range`);
      url.searchParams.set('symbol', symbol);
      url.searchParams.set('start', String(start));
      url.searchParams.set('end', String(end));
      url.searchParams.set('limit', String(this._historyLimit));
      if (cursor) url.searchParams.set('cursor', cursor);

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      const payload = (await res.json()) as TickRangeResponse;
      ticks.push(...this._normalizeTicks(payload.ticks ?? [], symbol));
      cursor = payload.next_cursor ?? '';
    } while (cursor);
    return ticks;
  }

  private _normalizeTicks(items: TickApiItem[], fallbackSymbol: string): CryptoTick[] {
    return items
      .map((item) => this._normalizeTick(item, fallbackSymbol))
      .filter((item): item is CryptoTick => item !== null);
  }

  private _normalizeTick(item: TickApiItem, fallbackSymbol: string): CryptoTick | null {
    const price = Number(item.price);
    const eventTime = String(item.event_time || '');
    if (!Number.isFinite(price) || !eventTime) return null;
    return {
      source: 'chainlink',
      symbol: this._normalizeSymbol(item.symbol || fallbackSymbol),
      rawSymbol: String(item.raw_symbol || item.symbol || fallbackSymbol),
      price,
      eventTime,
      wsTime: String(item.ws_time || ''),
      ingestedAt: String(item.ingested_at || ''),
      dedupKey: String(item.dedup_key ?? `${fallbackSymbol}:${eventTime}:${price}`),
    };
  }

  private _startHeartbeat(ws: WebSocketLike, connectionId: number): void {
    this._stopHeartbeat();
    this._heartbeatTimer = setInterval(() => {
      if (!this._isCurrent(connectionId) || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: 'ping' }));
    }, this._heartbeatMs);
  }

  private _scheduleReconnect(input: TradingCryptoTickStartInput, connectionId: number): void {
    if (this._closedMode) return;
    if (this._reconnectTimer) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (!this._isCurrent(connectionId)) return;
      this._connect(input, connectionId);
    }, this._reconnectDelayMs);
  }

  private _scheduleDisplayEndStop(
    input: TradingCryptoTickStartInput,
    connectionId: number,
  ): void {
    this._clearDisplayEndTimer();
    const displayEndMs = this._parseTime(input.window.displayEndTime);
    if (!displayEndMs) return;
    const delayMs = displayEndMs - Date.now();
    if (delayMs <= 0) {
      this._applyTicks([], 'closed');
      this._closedMode = true;
      void this._loadClosedRange(input, connectionId);
      return;
    }
    this._displayEndTimer = setTimeout(() => {
      this._displayEndTimer = null;
      if (!this._isCurrent(connectionId)) return;
      this._applyTicks([], 'closed');
      this._closedMode = true;
      this._disconnect();
      void this._loadClosedRange(input, connectionId);
    }, delayMs);
  }

  private _scheduleDisplayWindowRetry(
    input: TradingCryptoTickStartInput,
    connectionId: number,
  ): void {
    if (this._displayWindowRetryTimer) return;
    if (!this._shouldRetryDisplayWindow(input)) return;
    this._displayWindowRetryTimer = setTimeout(() => {
      this._displayWindowRetryTimer = null;
      if (!this._isCurrent(connectionId) || this._hasDisplayEndTick(input)) return;
      void this._loadClosedRange(input, connectionId);
    }, DISPLAY_WINDOW_RETRY_DELAY_MS);
  }

  private _shouldRetryDisplayWindow(input: TradingCryptoTickStartInput): boolean {
    const displayEndMs = this._parseTime(input.window.displayEndTime);
    if (!displayEndMs) return false;
    return Date.now() <= displayEndMs + DISPLAY_WINDOW_RETRY_GRACE_MS;
  }

  private _hasDisplayEndTick(input: TradingCryptoTickStartInput): boolean {
    const displayEndMs = this._parseTime(input.window.displayEndTime);
    if (!displayEndMs) return false;
    return Boolean(
      this._state?.ticks.some((tick) => {
        const tickMs = Date.parse(tick.eventTime);
        return Number.isFinite(tickMs) && tickMs >= displayEndMs;
      }),
    );
  }

  private _disconnect(): void {
    this._stopHeartbeat();
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    this._reconnectTimer = null;
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
  }

  private _clearDisplayEndTimer(): void {
    if (!this._displayEndTimer) return;
    clearTimeout(this._displayEndTimer);
    this._displayEndTimer = null;
  }

  private _clearDisplayWindowRetryTimer(): void {
    if (!this._displayWindowRetryTimer) return;
    clearTimeout(this._displayWindowRetryTimer);
    this._displayWindowRetryTimer = null;
  }

  private _stopHeartbeat(): void {
    if (!this._heartbeatTimer) return;
    clearInterval(this._heartbeatTimer);
    this._heartbeatTimer = null;
  }

  private _isCurrent(connectionId: number): boolean {
    return !this._disposed && this._connectionId === connectionId;
  }

  private _parseTime(value: string | null | undefined): number | null {
    if (!value) return null;
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : null;
  }

  private _parseJson(raw: string): unknown {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }

  private _filterDisplayTicks(ticks: CryptoTick[]): CryptoTick[] {
    const displayStartMs = this._parseTime(this._input?.window.displayStartTime);
    const displayEndMs = this._parseTime(this._input?.window.displayEndTime);
    if (!displayStartMs || !displayEndMs) return ticks;
    return ticks.filter((tick) => {
      const time = Date.parse(tick.eventTime);
      return Number.isFinite(time) && time >= displayStartMs && time <= displayEndMs;
    });
  }

  private _isDisplayWindowFinished(input: TradingCryptoTickStartInput): boolean {
    const displayEndMs = this._parseTime(input.window.displayEndTime);
    return Boolean(displayEndMs && displayEndMs <= Date.now());
  }

  private _cloneState(state: TradingRuntimeCryptoTickState): TradingRuntimeCryptoTickState {
    return {
      ...state,
      ticks: state.ticks.map((tick) => ({ ...tick })),
      latestTick: state.latestTick ? { ...state.latestTick } : null,
    };
  }

  private _errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private _now(): string {
    return new Date().toISOString();
  }
}

function createTradingCryptoTickClient(
  options: TradingCryptoTickClientOptions = {},
): TradingCryptoTickClientImpl {
  return new TradingCryptoTickClientImpl(options);
}

export { TradingCryptoTickClientImpl, createTradingCryptoTickClient };
