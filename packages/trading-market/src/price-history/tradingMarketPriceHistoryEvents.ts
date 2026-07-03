import type { PriceHistoryPoint } from '@polytrader/shared';

interface TradingMarketPriceHistoryUpdatedEvent {
  marketId: string;
  conditionId: string;
  interval: string;
  fidelity: number;
  pointsByToken: Record<string, PriceHistoryPoint[]>;
}

type TradingMarketPriceHistoryServiceEventMap = {
  'price-history-updated': [event: TradingMarketPriceHistoryUpdatedEvent];
};

export type { TradingMarketPriceHistoryServiceEventMap, TradingMarketPriceHistoryUpdatedEvent };
