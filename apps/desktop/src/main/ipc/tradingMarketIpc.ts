import type { IpcMain } from 'electron';
import type {
  MarketTradeAnalysisQuery,
  MarketTradeQuery,
  TradingMarketEvent,
  TradingMarketSubscribeOptions,
  TradingWindowInput,
} from '@polytrader/shared';
import type { TradingMarketRuntime, TradingMarketSubscription } from '@polytrader/trading-market';
import { fail, ok } from './result.js';
import { tradingMarketService } from '../services/tradingMarketService.js';

interface TradingMarketIpcSubscription {
  marketId: string;
  subscription: TradingMarketSubscription;
}

const tradingMarketSubscriptions = new Map<string, TradingMarketIpcSubscription>();
const tradingMarketDestroyedListeners = new Set<string>();

function senderSubscriptionId(event: Electron.IpcMainInvokeEvent): string {
  return `webContents:${event.sender.id}`;
}

function cloneablePayload<T>(value: T): T {
  return sanitizeForIpc(value, new WeakMap()) as T;
}

function sanitizeForIpc(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (value == null) return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'undefined') {
    return undefined;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    const existing = seen.get(value);
    if (existing) return existing;
    const output: unknown[] = [];
    seen.set(value, output);
    for (const item of value) output.push(sanitizeForIpc(item, seen) ?? null);
    return output;
  }
  if (typeof value === 'object') {
    const existing = seen.get(value);
    if (existing) return existing;
    const output: Record<string, unknown> = {};
    seen.set(value, output);
    for (const [key, item] of Object.entries(value)) {
      const sanitized = sanitizeForIpc(item, seen);
      if (typeof sanitized !== 'undefined') output[key] = sanitized;
    }
    return output;
  }
  return value;
}

function wrapRuntime<T, Args extends unknown[]>(
  handler: (...args: Args) => T | Promise<T>,
): (_event: Electron.IpcMainInvokeEvent, ...args: Args) => Promise<ReturnType<typeof ok<T>>> {
  return async (_event, ...args) => {
    try {
      return ok(cloneablePayload(await handler(...args)));
    } catch (error) {
      return fail(error);
    }
  };
}

function requireTradingMarket(marketId: string): TradingMarketRuntime {
  const market = tradingMarketService.getMarket(marketId);
  if (!market) throw new Error(`Trading market runtime does not exist: ${marketId}`);
  return market;
}

function unsubscribeTradingMarket(subscriptionId: string, marketId?: string): void {
  const current = tradingMarketSubscriptions.get(subscriptionId);
  if (!current) return;
  if (marketId && current.marketId !== marketId) return;
  current.subscription.unsubscribe();
  tradingMarketSubscriptions.delete(subscriptionId);
}

function sendTradingMarketEvent(
  event: Electron.IpcMainInvokeEvent,
  payload: TradingMarketEvent,
): void {
  if (event.sender.isDestroyed()) return;
  event.sender.send('trading-market:event', cloneablePayload(payload));
}

function ensureTradingMarketDestroyedListener(
  event: Electron.IpcMainInvokeEvent,
  subscriptionId: string,
): void {
  if (tradingMarketDestroyedListeners.has(subscriptionId)) return;
  tradingMarketDestroyedListeners.add(subscriptionId);
  event.sender.once('destroyed', () => {
    tradingMarketDestroyedListeners.delete(subscriptionId);
    unsubscribeTradingMarket(subscriptionId);
  });
}

function registerTradingMarketHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(
    'trading-market:subscribe',
    async (
      event,
      input: TradingWindowInput,
      options: TradingMarketSubscribeOptions | undefined,
    ) => {
      try {
        const subscriptionId = senderSubscriptionId(event);
        const previous = tradingMarketSubscriptions.get(subscriptionId);
        const result = await tradingMarketService.subscribe(input, options);
        result.subscription.onEvent((payload) => sendTradingMarketEvent(event, payload));
        tradingMarketSubscriptions.set(subscriptionId, {
          marketId: result.subscription.marketId,
          subscription: result.subscription,
        });
        previous?.subscription.unsubscribe();
        ensureTradingMarketDestroyedListener(event, subscriptionId);
        return ok(cloneablePayload(result.snapshot));
      } catch (error) {
        return fail(error);
      }
    },
  );
  ipcMain.handle(
    'trading-market:getSnapshot',
    wrapRuntime((marketId: string) => tradingMarketService.getSnapshot(marketId)),
  );
  ipcMain.handle(
    'trading-market:selectToken',
    wrapRuntime((marketId: string, tokenId: string, outcome?: string | null) =>
      requireTradingMarket(marketId).selectToken(tokenId, outcome),
    ),
  );
  ipcMain.handle(
    'trading-market:loadPriceHistory',
    wrapRuntime((marketId: string, interval?: string, fidelity?: number) =>
      requireTradingMarket(marketId).loadPriceHistory(interval, fidelity),
    ),
  );
  ipcMain.handle(
    'trading-market:listMarketTrades',
    wrapRuntime((marketId: string, query: MarketTradeQuery) =>
      requireTradingMarket(marketId).listMarketTrades(query),
    ),
  );
  ipcMain.handle(
    'trading-market:getTradeAnalysis',
    wrapRuntime((marketId: string, query: MarketTradeAnalysisQuery) =>
      requireTradingMarket(marketId).getMarketTradeAnalysis(query),
    ),
  );
  ipcMain.handle('trading-market:unsubscribe', (event, marketId: string) => {
    unsubscribeTradingMarket(senderSubscriptionId(event), marketId);
  });
}

export { registerTradingMarketHandlers };
