import type { GammaEventRaw, MarketTradeTick } from '@polytrader/shared';
import type { AppLocale } from '@polytrader/shared';

interface GammaEventPage {
  events: GammaEventRaw[];
  nextCursor?: string;
  ids?: string[];
}

interface EventSyncClient {
  streamOpenEvents(signal: AbortSignal, locale: AppLocale): AsyncIterable<GammaEventPage>;
}

interface MarketTradeStreamOptions {
  backfill: boolean;
  follow: boolean;
}

type MarketTradeStreamEvent =
  | {
      type: 'page';
      phase: 'backfill' | 'recent';
      conditionId: string;
      page: number;
      offset: number;
      total: number;
      trades: MarketTradeTick[];
    }
  | {
      type: 'backfill-done';
      conditionId: string;
      pages: number;
      total: number;
      offsetLimitReached: boolean;
    }
  | {
      type: 'heartbeat';
      conditionId: string;
      at: string;
    }
  | {
      type: 'done';
      conditionId: string;
      reason: string;
    };

interface MarketTradeSyncClient {
  streamMarketTrades(
    conditionId: string,
    options: MarketTradeStreamOptions,
    signal: AbortSignal,
  ): AsyncIterable<MarketTradeStreamEvent>;
}

export type {
  EventSyncClient,
  GammaEventPage,
  MarketTradeStreamEvent,
  MarketTradeStreamOptions,
  MarketTradeSyncClient,
};
