import { computed, onUnmounted, ref, shallowRef, watch, type Ref } from 'vue';
import type {
  MarketOutcome,
  MarketTradeTick,
  OrderBook,
  WsLastTradeEvent,
  WsMessage,
} from '@polytrader/shared';
import { POLYMARKET_MARKET_WS_URL } from '@polytrader/shared';
import {
  applyBookSnapshot,
  applyLastTrade,
  applyPriceChange,
  applyTickSizeChange,
  createEmptyBook,
  resolveLastTradePrice,
} from '@/shared/utils/orderBookState';

const PING_INTERVAL_MS = 10_000;
const MAX_RECONNECT_ATTEMPTS = 3;
const MAX_RECENT_TRADES = 200;

type WsStatus = 'disconnected' | 'connecting' | 'live' | 'error';

export function useMarketOrderBook(
  marketIdRef: Ref<string | null>,
  tokenOutcomes: Ref<MarketOutcome[] | undefined>,
) {
  const booksMap = shallowRef(new Map<string, OrderBook>());
  const recentTrades = ref<MarketTradeTick[]>([]);
  const wsStatus = ref<WsStatus>('disconnected');
  const reconnectAttempt = ref(0);
  const activeMarketId = ref<string | null>(null);

  let ws: WebSocket | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let mounted = true;
  let subscribedTokenIds: string[] = [];
  let connectionId = 0;
  let liveTradeSequence = 0;

  const orderBooks = computed(() => {
    const outcomes = tokenOutcomes.value || [];

    if (!marketIdRef.value || activeMarketId.value !== marketIdRef.value) {
      return outcomes.map(({ tokenId, label, minOrderSize }) =>
        createEmptyBook(tokenId, label, { minOrderSize, unavailable: true }),
      );
    }

    return outcomes.map(({ tokenId, label, minOrderSize }) => {
      const existing = booksMap.value.get(tokenId);
      if (existing) return existing;
      return createEmptyBook(tokenId, label, { minOrderSize });
    });
  });

  function reset(): void {
    connectionId += 1;
    activeMarketId.value = null;
    booksMap.value = new Map();
    recentTrades.value = [];
    disconnect();
  }

  function setBook(tokenId: string, book: OrderBook): void {
    const next = new Map(booksMap.value);
    next.set(tokenId, book);
    booksMap.value = next;
  }

  function getOrCreateBook(tokenId: string): OrderBook {
    const outcomes = tokenOutcomes.value || [];
    const outcome = outcomes.find((item) => item.tokenId === tokenId);
    const existing = booksMap.value.get(tokenId);
    if (existing) return { ...existing };
    return createEmptyBook(tokenId, outcome?.label || tokenId, {
      minOrderSize: outcome?.minOrderSize ?? null,
    });
  }

  function getOutcomeLabel(tokenId: string): string {
    const outcomes = tokenOutcomes.value || [];
    return outcomes.find((item) => item.tokenId === tokenId)?.label || tokenId;
  }

  function getTokenIds(): string[] {
    return (tokenOutcomes.value || []).map((item) => item.tokenId).filter(Boolean);
  }

  function getTokenKey(tokenIds: string[]): string {
    return [...tokenIds].sort().join('|');
  }

  function hasActiveSubscription(marketId: string, tokenIds: string[]): boolean {
    if (activeMarketId.value !== marketId) return false;
    if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
      return false;
    }
    return getTokenKey(subscribedTokenIds) === getTokenKey(tokenIds);
  }

  function normalizeLiveTrade(event: WsLastTradeEvent, book: OrderBook): MarketTradeTick {
    const tokenId = String(event.asset_id);
    const timestamp = event.timestamp || Date.now();
    const size = event.size ?? '';
    const id = [tokenId, timestamp, event.side, event.price, size, ++liveTradeSequence].join(':');

    return {
      id,
      tokenId,
      outcome: getOutcomeLabel(tokenId),
      side: event.side,
      price: resolveLastTradePrice(book, event.price) ?? undefined,
      priceRaw: event.price,
      size,
      timestamp,
      source: 'live',
    };
  }

  function mergeRecentTrades(trades: MarketTradeTick[], mode: 'replace' | 'prepend'): void {
    const next = mode === 'replace' ? trades : [...trades, ...recentTrades.value];
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

    recentTrades.value = deduped;
  }

  function setHistoricalTrades(trades: MarketTradeTick[]): void {
    mergeRecentTrades([...recentTrades.value, ...trades].slice(0, MAX_RECENT_TRADES), 'replace');
  }

  function clearRecentTrades(): void {
    recentTrades.value = [];
  }

  function clearTimers(): void {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function sendJson(payload: Record<string, unknown>): void {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  function startPing(activeConnectionId: number): void {
    clearTimers();
    pingTimer = setInterval(() => {
      if (activeConnectionId !== connectionId) return;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send('PING');
      }
    }, PING_INTERVAL_MS);
  }

  function handleMessageEvent(event: WsMessage, activeConnectionId: number): void {
    if (activeConnectionId !== connectionId) return;
    if (!event?.event_type) return;

    switch (event.event_type) {
      case 'book': {
        const book = getOrCreateBook(String(event.asset_id));
        applyBookSnapshot(book, event);
        setBook(String(event.asset_id), book);
        break;
      }
      case 'price_change': {
        for (const change of event.price_changes || []) {
          const tokenId = String(change.asset_id);
          const book = getOrCreateBook(tokenId);
          applyPriceChange(book, change);
          setBook(tokenId, book);
        }
        break;
      }
      case 'last_trade_price': {
        const tokenId = String(event.asset_id);
        const book = getOrCreateBook(tokenId);
        applyLastTrade(book, event);
        setBook(tokenId, book);
        mergeRecentTrades([normalizeLiveTrade(event, book)], 'prepend');
        break;
      }
      case 'tick_size_change': {
        const tokenId = String(event.asset_id);
        const book = getOrCreateBook(tokenId);
        applyTickSizeChange(book, event);
        setBook(tokenId, book);
        break;
      }
      default:
        break;
    }
  }

  function handleMessage(raw: string, activeConnectionId: number): void {
    if (activeConnectionId !== connectionId) return;
    if (raw === 'PONG') return;

    let event: unknown;
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }

    if (Array.isArray(event)) {
      event.forEach((item) => handleMessageEvent(item as WsMessage, activeConnectionId));
      return;
    }

    handleMessageEvent(event as WsMessage, activeConnectionId);
  }

  function scheduleReconnect(activeConnectionId: number): void {
    if (!mounted || activeConnectionId !== connectionId) return;
    if (reconnectAttempt.value >= MAX_RECONNECT_ATTEMPTS) {
      wsStatus.value = 'error';
      return;
    }

    reconnectAttempt.value += 1;
    wsStatus.value = 'connecting';
    const delay = Math.min(1000 * 2 ** (reconnectAttempt.value - 1), 8000);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (activeConnectionId !== connectionId) return;
      connect();
    }, delay);
  }

  function connect(): void {
    const marketId = marketIdRef.value;
    const tokenIds = getTokenIds();
    if (!marketId || !tokenIds.length || !mounted) return;
    if (hasActiveSubscription(marketId, tokenIds)) return;

    const activeConnectionId = ++connectionId;
    activeMarketId.value = marketId;
    booksMap.value = new Map(
      tokenIds.map((tokenId) => {
        const outcome = (tokenOutcomes.value || []).find((item) => item.tokenId === tokenId);
        return [
          tokenId,
          createEmptyBook(tokenId, outcome?.label || tokenId, {
            minOrderSize: outcome?.minOrderSize ?? null,
          }),
        ];
      }),
    );
    disconnect(false);
    subscribedTokenIds = tokenIds;
    wsStatus.value = 'connecting';

    ws = new WebSocket(POLYMARKET_MARKET_WS_URL);

    ws.onopen = () => {
      if (!mounted || activeConnectionId !== connectionId) return;
      reconnectAttempt.value = 0;
      wsStatus.value = 'live';
      sendJson({
        assets_ids: subscribedTokenIds,
        type: 'market',
        initial_dump: true,
      });
      startPing(activeConnectionId);
    };

    ws.onmessage = (event) => {
      handleMessage(String(event.data), activeConnectionId);
    };

    ws.onerror = () => {
      if (!mounted || activeConnectionId !== connectionId) return;
      wsStatus.value = 'error';
    };

    ws.onclose = () => {
      clearTimers();
      if (!mounted || activeConnectionId !== connectionId) return;
      ws = null;
      if (wsStatus.value !== 'disconnected') {
        scheduleReconnect(activeConnectionId);
      }
    };
  }

  function disconnect(resetStatus = true): void {
    clearTimers();

    if (ws) {
      if (ws.readyState === WebSocket.OPEN && subscribedTokenIds.length) {
        sendJson({
          operation: 'unsubscribe',
          assets_ids: subscribedTokenIds,
        });
      }
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      ws.close();
      ws = null;
    }

    subscribedTokenIds = [];
    if (resetStatus) {
      wsStatus.value = 'disconnected';
      reconnectAttempt.value = 0;
    }
  }

  function reconnect(): void {
    reconnectAttempt.value = 0;
    connect();
  }

  watch(marketIdRef, () => {
    reset();
  });

  watch(
    () => [marketIdRef.value || '', getTokenKey(getTokenIds())] as const,
    ([marketId, tokenKey]) => {
      if (!marketId || !tokenKey) return;
      connect();
    },
  );

  onUnmounted(() => {
    mounted = false;
    reset();
  });

  return {
    orderBooks,
    wsStatus,
    recentTrades,
    setHistoricalTrades,
    clearRecentTrades,
    reconnect,
    reset,
  };
}
