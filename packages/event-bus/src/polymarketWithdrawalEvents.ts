import type { PolymarketBridgeWithdrawalRecord } from '@polytrader/shared';

interface PolymarketWithdrawalCreatedEvent {
  withdrawal: PolymarketBridgeWithdrawalRecord;
  at: string;
}

interface PolymarketWithdrawalUpdatedEvent {
  withdrawal: PolymarketBridgeWithdrawalRecord;
  previousWithdrawal: PolymarketBridgeWithdrawalRecord;
  at: string;
}

interface PolymarketWithdrawalSucceededEvent {
  withdrawal: PolymarketBridgeWithdrawalRecord;
  at: string;
}

interface PolymarketWithdrawalFailedEvent {
  withdrawal: PolymarketBridgeWithdrawalRecord;
  at: string;
}

interface PolymarketWithdrawalTimedOutEvent {
  withdrawal: PolymarketBridgeWithdrawalRecord;
  at: string;
}

type PolymarketWithdrawalEventMap = {
  'polymarket-withdrawal:created': [event: PolymarketWithdrawalCreatedEvent];
  'polymarket-withdrawal:updated': [event: PolymarketWithdrawalUpdatedEvent];
  'polymarket-withdrawal:succeeded': [event: PolymarketWithdrawalSucceededEvent];
  'polymarket-withdrawal:failed': [event: PolymarketWithdrawalFailedEvent];
  'polymarket-withdrawal:timed-out': [event: PolymarketWithdrawalTimedOutEvent];
};

export type {
  PolymarketWithdrawalCreatedEvent,
  PolymarketWithdrawalEventMap,
  PolymarketWithdrawalFailedEvent,
  PolymarketWithdrawalSucceededEvent,
  PolymarketWithdrawalTimedOutEvent,
  PolymarketWithdrawalUpdatedEvent,
};
