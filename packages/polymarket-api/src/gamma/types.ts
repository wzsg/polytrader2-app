import type { GammaEventRaw, MarketTradeTick, PriceHistoryPoint } from '@polytrader/shared';

interface GammaEventKeysetResponse {
  events?: GammaEventRaw[];
  next_cursor?: string;
}

interface GammaStreamPage {
  events: GammaEventRaw[];
  nextCursor?: string;
  ids?: string[];
}

interface GammaStreamPagePayload {
  events?: GammaEventRaw[];
  nextCursor?: string;
  ids?: string[];
}

interface GammaSseMessage {
  event: string;
  data: unknown;
}

interface PriceHistoryStreamPage {
  tokenId: string;
  interval: string;
  fidelity: number;
  pointOffset: number;
  complete: boolean;
  points: PriceHistoryPoint[];
}

interface PriceHistoryStreamPagePayload {
  tokenId?: unknown;
  interval?: unknown;
  fidelity?: unknown;
  pointOffset?: unknown;
  complete?: unknown;
  points?: unknown;
}

interface MarketTradeStreamOptions {
  backfill?: boolean;
  follow?: boolean;
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

interface MarketTradeStreamPagePayload {
  phase?: unknown;
  conditionId?: unknown;
  page?: unknown;
  offset?: unknown;
  total?: unknown;
  trades?: unknown;
}

interface MarketTradeBackfillDonePayload {
  conditionId?: unknown;
  pages?: unknown;
  total?: unknown;
  offsetLimitReached?: unknown;
}

interface MarketTradeHeartbeatPayload {
  conditionId?: unknown;
  at?: unknown;
}

interface MarketTradeDonePayload {
  conditionId?: unknown;
  reason?: unknown;
}

export type {
  GammaEventKeysetResponse,
  GammaSseMessage,
  GammaStreamPage,
  GammaStreamPagePayload,
  MarketTradeBackfillDonePayload,
  MarketTradeDonePayload,
  MarketTradeHeartbeatPayload,
  MarketTradeStreamEvent,
  MarketTradeStreamOptions,
  MarketTradeStreamPagePayload,
  PriceHistoryStreamPage,
  PriceHistoryStreamPagePayload,
};
