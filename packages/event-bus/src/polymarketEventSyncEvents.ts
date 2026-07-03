import type { SyncStatus } from '@polytrader/shared';

interface PolymarketEventSyncStatusEvent {
  status: SyncStatus;
  at: string;
}

type PolymarketEventSyncEventMap = {
  'polymarket-event-sync:status': [event: PolymarketEventSyncStatusEvent];
};

export type { PolymarketEventSyncEventMap, PolymarketEventSyncStatusEvent };
