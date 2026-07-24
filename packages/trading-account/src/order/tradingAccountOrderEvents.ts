type TradingAccountOrderTradingEventReason =
  | 'place-local'
  | 'place-success'
  | 'place-failed'
  | 'cancel-success'
  | 'cancel-partial'
  | 'cancel-failed'
  | 'cancel-orders-success'
  | 'cancel-orders-partial'
  | 'cancel-orders-failed'
  | 'cancel-all-success'
  | 'cancel-all-partial'
  | 'cancel-all-failed';

interface TradingAccountOrderTradingEvent {
  walletId: string;
  reason: TradingAccountOrderTradingEventReason;
  orderId?: string;
  exchangeOrderId?: string | null;
  exchangeOrderIds?: string[];
  at: string;
}

type TradingAccountOrderTradingEventMap = {
  'order-trading-event': [event: TradingAccountOrderTradingEvent];
};

export type {
  TradingAccountOrderTradingEvent,
  TradingAccountOrderTradingEventMap,
  TradingAccountOrderTradingEventReason,
};
