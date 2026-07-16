import type { EventSyncStatus } from '@polytrader/shared';

interface PolymarketEventSyncStatusEvent {
  status: EventSyncStatus;
  at: string;
}

type PolymarketEventSyncEventMap = {
  'polymarket-event-sync:status': [event: PolymarketEventSyncStatusEvent];
};

export type { PolymarketEventSyncEventMap, PolymarketEventSyncStatusEvent };
