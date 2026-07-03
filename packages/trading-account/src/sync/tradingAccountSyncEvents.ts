import type { TradingAccountBalanceDataChangedEvent } from './balance/index.js';
import type { TradingAccountOrderSyncEvent } from './order/index.js';
import type { TradingAccountPositionDataChangedEvent } from './position/index.js';
import type { TradingAccountTradeDataChangedEvent } from './trade/index.js';

type TradingAccountSyncEventMap = {
  'order-sync-event': [event: TradingAccountOrderSyncEvent];
  'trade-sync-event': [event: TradingAccountTradeDataChangedEvent];
  'position-sync-event': [event: TradingAccountPositionDataChangedEvent];
  'balance-sync-event': [event: TradingAccountBalanceDataChangedEvent];
};

export type { TradingAccountSyncEventMap };
