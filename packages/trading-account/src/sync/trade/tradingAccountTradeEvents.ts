type TradingAccountTradeDataChangeReason = 'sync-trades';

interface TradingAccountTradeDataChangedEvent {
  walletId: string;
  reason: TradingAccountTradeDataChangeReason;
  at: string;
}

export type { TradingAccountTradeDataChangedEvent, TradingAccountTradeDataChangeReason };
