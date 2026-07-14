import { EventEmitter } from 'events';
import type {
  MarketOutcome,
  MarketTradeTick,
  OrderBook,
  OrderBookLevel,
  TradingRuntimeWsStatus,
  WsBookEvent,
  WsLastTradeEvent,
  WsMessage,
  WsPriceChange,
  WsTickSizeEvent,
} from '@polytrader/shared';
import { POLYMARKET_MARKET_WS_URL } from '@polytrader/shared';
import type { TradingOrderBookEventMap } from './tradingOrderBookEvents.js';

const PING_INTERVAL_MS = 10_000;
const MAX_RECONNECT_ATTEMPTS = 3;
const MAX_RECENT_TRADES = 200;

interface OrderBookWebSocketSnapshot {
  orderBooks: OrderBook[];
  recentLiveTrades: MarketTradeTick[];
  wsStatus: TradingRuntimeWsStatus;
}

interface OrderBookWebSocketClient {
  setOutcomes(outcomes: MarketOutcome[]): void;
  snapshot(): OrderBookWebSocketSnapshot;
  dispose(): void;
  on(eventName: 'order-book-changed', listener: () => void): unknown;
}

class OrderBookWebSocketClientImpl
  extends EventEmitter<TradingOrderBookEventMap>
  implements OrderBookWebSocketClient
{
  private readonly _books = new Map<string, OrderBook>();
  private readonly _marketId: string;
  private _recentTrades: MarketTradeTick[] = [];
  private _status: TradingRuntimeWsStatus = 'disconnected';
  private _outcomes: MarketOutcome[] = [];
  private _ws: WebSocket | null = null;
  private _pingTimer: ReturnType<typeof setInterval> | null = null;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _reconnectAttempt = 0;
  private _subscribedTokenIds: string[] = [];
  private _connectionId = 0;
  private _liveTradeSequence = 0;
  private _disposed = false;

  public constructor(marketId: string) {
    super();
    this._marketId = marketId;
  }

  public setOutcomes(outcomes: MarketOutcome[]): void {
    this._outcomes = outcomes.filter((outcome) => outcome.tokenId);
    const activeTokenIds = new Set(this._outcomes.map((outcome) => outcome.tokenId));
    for (const tokenId of [...this._books.keys()]) {
      if (!activeTokenIds.has(tokenId)) this._books.delete(tokenId);
    }
    for (const outcome of this._outcomes) {
      if (!this._books.has(outcome.tokenId)) {
        this._books.set(outcome.tokenId, this._createEmptyBook(outcome));
      }
    }
    this._connect();
    this.emit('order-book-changed');
  }

  public snapshot(): OrderBookWebSocketSnapshot {
    return {
      orderBooks: this._outcomes.map((outcome) => {
        const book = this._books.get(outcome.tokenId);
        return book ? this._cloneBook(book) : this._createEmptyBook(outcome);
      }),
      recentLiveTrades: this._recentTrades.map((trade) => ({ ...trade })),
      wsStatus: this._status,
    };
  }

  public dispose(): void {
    this._disposed = true;
    this._connectionId += 1;
    this._disconnect();
    this._books.clear();
    this._recentTrades = [];
    this.removeAllListeners();
  }

  private _tokenIds(): string[] {
    return this._outcomes.map((outcome) => outcome.tokenId).filter(Boolean);
  }

  private _tokenKey(tokenIds: string[]): string {
    return [...tokenIds].sort().join('|');
  }

  private _hasActiveSubscription(tokenIds: string[]): boolean {
    if (
      !this._ws ||
      this._ws.readyState === WebSocket.CLOSED ||
      this._ws.readyState === WebSocket.CLOSING
    ) {
      return false;
    }
    return this._tokenKey(this._subscribedTokenIds) === this._tokenKey(tokenIds);
  }

  private _setStatus(status: TradingRuntimeWsStatus): void {
    if (this._status === status) return;
    this._status = status;
    this.emit('order-book-changed');
  }

  private _connect(): void {
    const tokenIds = this._tokenIds();
    if (this._disposed || !this._marketId || !tokenIds.length) return;
    if (this._hasActiveSubscription(tokenIds)) return;

    const activeConnectionId = ++this._connectionId;
    this._disconnect(false);
    this._subscribedTokenIds = tokenIds;
    this._setStatus('connecting');

    this._ws = new WebSocket(POLYMARKET_MARKET_WS_URL);
    this._ws.onopen = () => {
      if (this._disposed || activeConnectionId !== this._connectionId) return;
      this._reconnectAttempt = 0;
      this._setStatus('live');
      this._sendJson({
        assets_ids: this._subscribedTokenIds,
        type: 'market',
        initial_dump: true,
      });
      this._startPing(activeConnectionId);
    };
    this._ws.onmessage = (event) => {
      this._handleMessage(String(event.data), activeConnectionId);
    };
    this._ws.onerror = () => {
      if (this._disposed || activeConnectionId !== this._connectionId) return;
      this._setStatus('error');
    };
    this._ws.onclose = () => {
      this._clearTimers();
      if (this._disposed || activeConnectionId !== this._connectionId) return;
      this._ws = null;
      if (this._status !== 'disconnected') this._scheduleReconnect(activeConnectionId);
    };
  }

  private _disconnect(resetStatus = true): void {
    this._clearTimers();
    if (this._ws) {
      if (this._ws.readyState === WebSocket.OPEN && this._subscribedTokenIds.length) {
        this._sendJson({
          operation: 'unsubscribe',
          assets_ids: this._subscribedTokenIds,
        });
      }
      this._ws.onclose = null;
      this._ws.onerror = null;
      this._ws.onmessage = null;
      this._ws.close();
      this._ws = null;
    }
    this._subscribedTokenIds = [];
    if (resetStatus) {
      this._reconnectAttempt = 0;
      this._setStatus('disconnected');
    }
  }

  private _clearTimers(): void {
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  private _sendJson(payload: Record<string, unknown>): void {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(payload));
    }
  }

  private _startPing(activeConnectionId: number): void {
    this._clearTimers();
    this._pingTimer = setInterval(() => {
      if (activeConnectionId === this._connectionId && this._ws?.readyState === WebSocket.OPEN) {
        this._ws.send('PING');
      }
    }, PING_INTERVAL_MS);
  }

  private _scheduleReconnect(activeConnectionId: number): void {
    if (this._disposed || activeConnectionId !== this._connectionId) return;
    if (this._reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      this._setStatus('error');
      return;
    }
    this._reconnectAttempt += 1;
    this._setStatus('connecting');
    const delay = Math.min(1000 * 2 ** (this._reconnectAttempt - 1), 8000);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (activeConnectionId === this._connectionId) this._connect();
    }, delay);
  }

  private _handleMessage(raw: string, activeConnectionId: number): void {
    if (activeConnectionId !== this._connectionId) return;
    if (raw === 'PONG') return;
    let event: unknown;
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }
    if (Array.isArray(event)) {
      event.forEach((item) => this._handleMessageEvent(item as WsMessage, activeConnectionId));
    } else {
      this._handleMessageEvent(event as WsMessage, activeConnectionId);
    }
  }

  private _handleMessageEvent(event: WsMessage, activeConnectionId: number): void {
    if (activeConnectionId !== this._connectionId || !event?.event_type) return;
    switch (event.event_type) {
      case 'book': {
        const tokenId = String(event.asset_id);
        const book = this._getOrCreateBook(tokenId);
        this._applyBookSnapshot(book, event);
        this._books.set(tokenId, book);
        break;
      }
      case 'price_change': {
        for (const change of event.price_changes || []) {
          const tokenId = String(change.asset_id);
          const book = this._getOrCreateBook(tokenId);
          this._applyPriceChange(book, change);
          this._books.set(tokenId, book);
        }
        break;
      }
      case 'last_trade_price': {
        const tokenId = String(event.asset_id);
        const book = this._getOrCreateBook(tokenId);
        this._applyLastTrade(book, event);
        this._books.set(tokenId, book);
        this._mergeRecentTrades([this._normalizeLiveTrade(event, book)]);
        break;
      }
      case 'tick_size_change': {
        const tokenId = String(event.asset_id);
        const book = this._getOrCreateBook(tokenId);
        this._applyTickSizeChange(book, event);
        this._books.set(tokenId, book);
        break;
      }
      default:
        return;
    }
    this.emit('order-book-changed');
  }

  private _getOrCreateBook(tokenId: string): OrderBook {
    const existing = this._books.get(tokenId);
    if (existing) return { ...existing, bids: [...existing.bids], asks: [...existing.asks] };
    const outcome = this._outcomes.find((item) => item.tokenId === tokenId);
    return this._createEmptyBook(
      outcome ?? {
        tokenId,
        label: tokenId,
        displayLabel: tokenId,
        price: null,
        tickSize: null,
        minOrderSize: null,
      },
    );
  }

  private _normalizeLiveTrade(event: WsLastTradeEvent, book: OrderBook): MarketTradeTick {
    const tokenId = String(event.asset_id);
    const timestamp = event.timestamp || Date.now();
    const size = event.size ?? '';
    const id = [tokenId, timestamp, event.side, event.price, size, ++this._liveTradeSequence].join(
      ':',
    );
    return {
      id,
      tokenId,
      outcome: this._outcomes.find((outcome) => outcome.tokenId === tokenId)?.label || tokenId,
      side: event.side,
      price: this._resolveLastTradePrice(book, event.price) ?? undefined,
      priceRaw: event.price,
      size,
      timestamp,
      source: 'live',
    };
  }

  private _mergeRecentTrades(trades: MarketTradeTick[]): void {
    const next = [...trades, ...this._recentTrades];
    const seen = new Set<string>();
    const deduped: MarketTradeTick[] = [];
    for (const trade of next) {
      const key =
        trade.id || [trade.tokenId, trade.timestamp, trade.side, trade.price, trade.size].join(':');
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push({ ...trade, id: key });
      if (deduped.length >= MAX_RECENT_TRADES) break;
    }
    this._recentTrades = deduped;
  }

  private _createEmptyBook(outcome: MarketOutcome, meta: Partial<OrderBook> = {}): OrderBook {
    return {
      tokenId: outcome.tokenId,
      label: outcome.displayLabel,
      bids: [],
      asks: [],
      tickSize: meta.tickSize ?? outcome.tickSize ?? null,
      minOrderSize: meta.minOrderSize ?? outcome.minOrderSize ?? null,
      lastTradePrice: meta.lastTradePrice ?? null,
      lastTradeSide: meta.lastTradeSide ?? null,
      lastTradePriceRaw: meta.lastTradePriceRaw ?? null,
      unavailable: meta.unavailable ?? false,
    };
  }

  private _cloneBook(book: OrderBook): OrderBook {
    return {
      ...book,
      bids: book.bids.map((level) => ({ ...level })),
      asks: book.asks.map((level) => ({ ...level })),
    };
  }

  private _hasRealQuotes(book: OrderBook): boolean {
    const bid = Number(book.bids?.[0]?.price);
    const ask = Number(book.asks?.[0]?.price);
    if (Number.isNaN(bid) || Number.isNaN(ask)) return false;
    if (bid <= 0.01 && ask >= 0.99) return false;
    return true;
  }

  private _resolveLastTradePrice(book: OrderBook, rawPrice: unknown): string | null {
    if (rawPrice == null || rawPrice === '') return null;
    const price = Number(rawPrice);
    if (Number.isNaN(price)) return String(rawPrice);
    if (!this._hasRealQuotes(book)) return String(rawPrice);
    const mid = (Number(book.bids[0].price) + Number(book.asks[0].price)) / 2;
    const direct = Math.abs(price - mid);
    const complement = Math.abs(1 - price - mid);
    return String(complement < direct ? 1 - price : price);
  }

  private _syncLastTradeFromRaw(book: OrderBook, rawPrice: unknown, side?: string): OrderBook {
    if (rawPrice == null || rawPrice === '') return book;
    book.lastTradePriceRaw = String(rawPrice);
    book.lastTradePrice = this._resolveLastTradePrice(book, book.lastTradePriceRaw);
    if (side) book.lastTradeSide = side;
    return book;
  }

  private _reconcileLastTradePrice(book: OrderBook): OrderBook {
    if (book.lastTradePriceRaw != null) {
      book.lastTradePrice = this._resolveLastTradePrice(book, book.lastTradePriceRaw);
    }
    return book;
  }

  private _applyBookSnapshot(book: OrderBook, event: WsBookEvent): OrderBook {
    book.bids = [...(event.bids || [])];
    book.asks = [...(event.asks || [])];
    book.unavailable = false;
    if (event.tick_size != null) book.tickSize = event.tick_size;
    if (event.min_order_size != null) book.minOrderSize = event.min_order_size;
    this._sortBookSide(book.bids, 'desc');
    this._sortBookSide(book.asks, 'asc');
    if (event.last_trade_price != null) {
      this._syncLastTradeFromRaw(book, event.last_trade_price, event.last_trade_side);
    } else {
      this._reconcileLastTradePrice(book);
    }
    return book;
  }

  private _applyPriceChange(book: OrderBook, change: WsPriceChange): OrderBook {
    const side = change.side === 'BUY' ? book.bids : book.asks;
    this._upsertLevel(side, change.price, change.size);
    this._sortBookSide(side, change.side === 'BUY' ? 'desc' : 'asc');
    this._reconcileLastTradePrice(book);
    return book;
  }

  private _applyLastTrade(book: OrderBook, event: WsLastTradeEvent): OrderBook {
    return this._syncLastTradeFromRaw(book, event.price, event.side);
  }

  private _applyTickSizeChange(book: OrderBook, event: WsTickSizeEvent): OrderBook {
    book.tickSize = event.new_tick_size ?? book.tickSize;
    return book;
  }

  private _upsertLevel(levels: OrderBookLevel[], price: string, size: string): void {
    const idx = levels.findIndex((level) => level.price === price);
    const n = Number(size);
    if (!size || n === 0) {
      if (idx >= 0) levels.splice(idx, 1);
      return;
    }
    if (idx >= 0) levels[idx] = { price, size };
    else levels.push({ price, size });
  }

  private _sortBookSide(levels: OrderBookLevel[], direction: 'asc' | 'desc'): void {
    levels.sort((a, b) => {
      const diff = Number(a.price) - Number(b.price);
      return direction === 'desc' ? -diff : diff;
    });
  }
}

function createOrderBookWebSocketClient(marketId: string): OrderBookWebSocketClient {
  return new OrderBookWebSocketClientImpl(marketId);
}

export { createOrderBookWebSocketClient };
export type { OrderBookWebSocketClient, OrderBookWebSocketSnapshot };
