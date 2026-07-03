import type { Address, Hex } from 'viem';

interface NormalizedRelayerCredentials {
  privateKey: Hex;
  depositWalletAddress: Address;
  chainId: number;
  relayerApiBaseUrl: string;
}

interface DepositWalletCall {
  target: Address;
  value: string;
  data: Hex;
}

interface PolymarketRelayerSubmitResult {
  transactionID: string;
  state: string;
  transactionHash?: string;
  hash?: string;
}

interface RelayerNonceResult {
  nonce: string;
}

interface PolymarketRelayerApprovalInput {
  nonce: string;
  amount?: string;
  deadline?: string;
}

interface PolymarketRelayerCtfAmountInput {
  nonce: string;
  conditionId: Hex;
  amount: string;
  negRisk: boolean;
  deadline?: string;
}

type PolymarketRelayerSplitInput = PolymarketRelayerCtfAmountInput;
type PolymarketRelayerMergeInput = PolymarketRelayerCtfAmountInput;

interface PolymarketRelayerRedeemInput {
  nonce: string;
  conditionId: Hex;
  indexSets?: number[];
  negRisk: boolean;
  deadline?: string;
}

interface PolymarketRelayerTransferPusdInput {
  nonce: string;
  to: Address;
  amount: string;
  deadline?: string;
}

export type {
  DepositWalletCall,
  NormalizedRelayerCredentials,
  PolymarketRelayerApprovalInput,
  PolymarketRelayerCtfAmountInput,
  PolymarketRelayerMergeInput,
  PolymarketRelayerTransferPusdInput,
  RelayerNonceResult,
  PolymarketRelayerRedeemInput,
  PolymarketRelayerSplitInput,
  PolymarketRelayerSubmitResult,
};
