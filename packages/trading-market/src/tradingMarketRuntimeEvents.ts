import type {
  TradingMarketEventMap,
  TradingMarketEventName,
  TradingMarketEventPayload,
} from '@polytrader/shared';

type TradingMarketRuntimeEventMap = {
  [EventName in TradingMarketEventName]: [event: TradingMarketEventMap[EventName]];
};

type TradingMarketRuntimeEventName = TradingMarketEventName;
type TradingMarketRuntimeEvent = TradingMarketEventPayload;

const TRADING_MARKET_RUNTIME_EVENT_NAMES = [
  'runtime-snapshot',
  'runtime-status',
  'gamma-event',
  'market-detail',
  'order-book',
  'price-history-loaded',
  'price-history-updated',
  'market-trades-state',
  'crypto-tick',
] as const satisfies readonly TradingMarketRuntimeEventName[];

export { TRADING_MARKET_RUNTIME_EVENT_NAMES };
export type {
  TradingMarketRuntimeEvent,
  TradingMarketRuntimeEventMap,
  TradingMarketRuntimeEventName,
};
