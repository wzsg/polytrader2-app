type TradingAccountPositionAmountInput = string | number;

interface TradingAccountPositionBaseInput {
  walletId: string;
  conditionId: string;
  negRisk?: boolean;
}

interface TradingAccountPositionSplitInput extends TradingAccountPositionBaseInput {
  amount: TradingAccountPositionAmountInput;
}

interface TradingAccountPositionMergeInput extends TradingAccountPositionBaseInput {
  amount: TradingAccountPositionAmountInput;
}

interface TradingAccountPositionRedeemInput extends TradingAccountPositionBaseInput {
  indexSets?: number[];
}

interface TradingAccountPositionOperationResult {
  transactionID: string;
  state: string;
  transactionHash?: string;
  hash?: string;
}

export type {
  TradingAccountPositionAmountInput,
  TradingAccountPositionMergeInput,
  TradingAccountPositionOperationResult,
  TradingAccountPositionRedeemInput,
  TradingAccountPositionSplitInput,
};
