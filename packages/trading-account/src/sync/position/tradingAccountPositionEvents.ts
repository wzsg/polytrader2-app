type TradingAccountPositionDataChangeReason = 'sync-positions' | 'sync-position-summary';

interface TradingAccountPositionDataChangedEvent {
  walletId: string;
  reason: TradingAccountPositionDataChangeReason;
  positionsTotalValue?: number | null;
  positionsInitialValue?: number | null;
  at: string;
}

export type { TradingAccountPositionDataChangedEvent, TradingAccountPositionDataChangeReason };
