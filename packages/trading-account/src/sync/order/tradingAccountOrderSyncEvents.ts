type TradingAccountOrderSyncEventReason = 'sync-open-orders';

interface TradingAccountOrderSyncEvent {
  walletId: string;
  reason: TradingAccountOrderSyncEventReason;
  at: string;
}

type TradingAccountOrderSyncEventMap = {
  'order-sync-event': [event: TradingAccountOrderSyncEvent];
};

export type {
  TradingAccountOrderSyncEvent,
  TradingAccountOrderSyncEventMap,
  TradingAccountOrderSyncEventReason,
};
