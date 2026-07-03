import type {
  TradingAccountPositionAmountInput,
  TradingAccountPositionOperationResult,
} from './tradingPosition.js';

interface PolymarketBridgeAddressSet {
  evm?: string;
  svm?: string;
  btc?: string;
  tvm?: string;
}

interface PolymarketBridgeChain {
  id?: string;
  name?: string;
  iconUrl?: string;
}

interface PolymarketBridgeToken {
  name?: string;
  symbol?: string;
  address: string;
  decimals?: number;
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
  walletId: string;
}

interface PolymarketBridgeAddressResponse {
  address: PolymarketBridgeAddressSet;
  note?: string;
}

interface PolymarketBridgeWithdrawalInput {
  walletId: string;
  amount: TradingAccountPositionAmountInput;
  toChainId: string;
  toTokenAddress: string;
  recipientAddr: string;
}

interface PolymarketBridgeQuoteInput {
  amount: TradingAccountPositionAmountInput;
  toChainId: string;
  toTokenAddress: string;
  recipientAddress: string;
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

interface PolymarketBridgeWithdrawalResult {
  withdrawal: PolymarketBridgeAddressResponse;
  bridgeAddress: string;
  transfer: TradingAccountPositionOperationResult;
}

export type {
  PolymarketBridgeAddressResponse,
  PolymarketBridgeAddressSet,
  PolymarketBridgeChain,
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
  PolymarketBridgeWithdrawalResult,
};
