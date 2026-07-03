import type {
  OrderBook,
  OrderBookLevel,
  WsBookEvent,
  WsLastTradeEvent,
  WsPriceChange,
  WsTickSizeEvent,
} from '@polytrader/shared';

export function createEmptyBook(
  tokenId: string,
  label: string,
  meta: Partial<OrderBook> = {},
): OrderBook {
  return {
    tokenId,
    label,
    bids: [],
    asks: [],
    tickSize: meta.tickSize ?? null,
    minOrderSize: meta.minOrderSize ?? null,
    lastTradePrice: meta.lastTradePrice ?? null,
    lastTradeSide: meta.lastTradeSide ?? null,
    lastTradePriceRaw: meta.lastTradePriceRaw ?? null,
    unavailable: meta.unavailable ?? false,
  };
}

function hasRealQuotes(book: OrderBook): boolean {
  const bid = Number(book.bids?.[0]?.price);
  const ask = Number(book.asks?.[0]?.price);
  if (Number.isNaN(bid) || Number.isNaN(ask)) return false;
  if (bid <= 0.01 && ask >= 0.99) return false;
  return true;
}

export function resolveLastTradePrice(book: OrderBook, rawPrice: unknown): string | null {
  if (rawPrice == null || rawPrice === '') return null;

  const price = Number(rawPrice);
  if (Number.isNaN(price)) return String(rawPrice);

  if (!hasRealQuotes(book)) {
    return String(rawPrice);
  }

  const mid = (Number(book.bids[0].price) + Number(book.asks[0].price)) / 2;
  const direct = Math.abs(price - mid);
  const complement = Math.abs(1 - price - mid);
  const resolved = complement < direct ? 1 - price : price;
  return String(resolved);
}

function syncLastTradeFromRaw(book: OrderBook, rawPrice: unknown, side?: string): OrderBook {
  if (rawPrice == null || rawPrice === '') return book;

  book.lastTradePriceRaw = String(rawPrice);
  book.lastTradePrice = resolveLastTradePrice(book, book.lastTradePriceRaw);
  if (side) book.lastTradeSide = side;
  return book;
}

function reconcileLastTradePrice(book: OrderBook): OrderBook {
  if (book.lastTradePriceRaw == null) return book;
  book.lastTradePrice = resolveLastTradePrice(book, book.lastTradePriceRaw);
  return book;
}

export function applyBookSnapshot(book: OrderBook, event: WsBookEvent): OrderBook {
  book.bids = [...(event.bids || [])];
  book.asks = [...(event.asks || [])];
  book.unavailable = false;
  if (event.tick_size != null) book.tickSize = event.tick_size;
  if (event.min_order_size != null) book.minOrderSize = event.min_order_size;
  sortBookSide(book.bids, 'desc');
  sortBookSide(book.asks, 'asc');

  if (event.last_trade_price != null) {
    syncLastTradeFromRaw(book, event.last_trade_price, event.last_trade_side);
  } else {
    reconcileLastTradePrice(book);
  }

  return book;
}

export function applyPriceChange(book: OrderBook, change: WsPriceChange): OrderBook {
  const side = change.side === 'BUY' ? book.bids : book.asks;
  const sort = change.side === 'BUY' ? 'desc' : 'asc';
  upsertLevel(side, change.price, change.size);
  sortBookSide(side, sort);
  reconcileLastTradePrice(book);
  return book;
}

export function applyLastTrade(book: OrderBook, event: WsLastTradeEvent): OrderBook {
  syncLastTradeFromRaw(book, event.price, event.side);
  return book;
}

export function applyTickSizeChange(book: OrderBook, event: WsTickSizeEvent): OrderBook {
  book.tickSize = event.new_tick_size ?? book.tickSize;
  return book;
}

function upsertLevel(levels: OrderBookLevel[], price: string, size: string): void {
  const idx = levels.findIndex((level) => level.price === price);
  const n = Number(size);

  if (!size || n === 0) {
    if (idx >= 0) levels.splice(idx, 1);
    return;
  }

  if (idx >= 0) {
    levels[idx] = { price, size };
  } else {
    levels.push({ price, size });
  }
}

function sortBookSide(levels: OrderBookLevel[], direction: 'asc' | 'desc'): void {
  levels.sort((a, b) => {
    const diff = Number(a.price) - Number(b.price);
    return direction === 'desc' ? -diff : diff;
  });
}
