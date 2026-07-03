import type { BalanceAllowance } from '@polytrader/shared';

type TradingAccountBalanceDataChangeReason = 'sync-balance';

interface TradingAccountBalanceDataChangedEvent {
  walletId: string;
  reason: TradingAccountBalanceDataChangeReason;
  balance: BalanceAllowance;
  at: string;
}

export type { TradingAccountBalanceDataChangedEvent, TradingAccountBalanceDataChangeReason };
