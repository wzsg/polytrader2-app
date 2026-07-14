interface PolymarketBridgeAddressSet {
  evm?: string;
  svm?: string;
  btc?: string;
  tron?: string;
}

interface PolymarketBridgeToken {
  name?: string;
  symbol?: string;
  address: string;
  decimals?: number;
  iconUrl?: string;
}

interface PolymarketBridgeChain {
  id?: string;
  name?: string;
  iconUrl?: string;
}

interface PolymarketBridgeSupportedAsset {
  chainId: string;
  chainName?: string;
  chain?: PolymarketBridgeChain;
  token: PolymarketBridgeToken;
  minCheckoutUsd?: number;
}

interface PolymarketBridgeSupportedAssetsResponse {
  supportedAssets: PolymarketBridgeSupportedAsset[];
  iconBaseUrl?: string;
}

interface PolymarketBridgeDepositInput {
  address: string;
}

interface PolymarketBridgeWithdrawalInput {
  address: string;
  toChainId: string;
  toTokenAddress: string;
  recipientAddr: string;
}

interface PolymarketBridgeAddressResponse {
  address: PolymarketBridgeAddressSet;
  note?: string;
}

interface PolymarketBridgeQuoteInput {
  fromAmountBaseUnit: string;
  fromChainId: string;
  fromTokenAddress: string;
  recipientAddress: string;
  toChainId: string;
  toTokenAddress: string;
}

interface PolymarketBridgeFeeBreakdown {
  appFeeLabel?: string;
  appFeePercent?: number;
  appFeeUsd?: number;
  fillCostPercent?: number;
  fillCostUsd?: number;
  gasUsd?: number;
  maxSlippage?: number;
  minReceived?: number;
  swapImpact?: number;
  swapImpactUsd?: number;
  totalImpact?: number;
  totalImpactUsd?: number;
}

interface PolymarketBridgeQuoteResponse {
  estCheckoutTimeMs?: number;
  estFeeBreakdown?: PolymarketBridgeFeeBreakdown;
  estInputUsd?: number;
  estOutputUsd?: number;
  estToTokenBaseUnit?: string;
  quoteId?: string;
}

type PolymarketBridgeTransactionStatus =
  | 'DEPOSIT_DETECTED'
  | 'PROCESSING'
  | 'ORIGIN_TX_CONFIRMED'
  | 'SUBMITTED'
  | 'COMPLETED'
  | 'FAILED';

interface PolymarketBridgeTransaction {
  fromChainId?: string;
  fromTokenAddress?: string;
  fromAmountBaseUnit?: string;
  toChainId?: string;
  toTokenAddress?: string;
  status?: PolymarketBridgeTransactionStatus | string;
  txHash?: string;
  createdTimeMs?: number;
}

interface PolymarketBridgeTransactionStatusResponse {
  transactions: PolymarketBridgeTransaction[];
}

export type {
  PolymarketBridgeAddressResponse,
  PolymarketBridgeAddressSet,
  PolymarketBridgeDepositInput,
  PolymarketBridgeFeeBreakdown,
  PolymarketBridgeQuoteInput,
  PolymarketBridgeQuoteResponse,
  PolymarketBridgeSupportedAsset,
  PolymarketBridgeSupportedAssetsResponse,
  PolymarketBridgeToken,
  PolymarketBridgeTransaction,
  PolymarketBridgeTransactionStatus,
  PolymarketBridgeTransactionStatusResponse,
  PolymarketBridgeWithdrawalInput,
};
