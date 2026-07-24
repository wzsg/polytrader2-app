import type {
  BalanceAllowance,
  ClobOrder,
  ClobTrade,
  DataPosition,
  OrderCancellationResult,
  SupportedPriceTickSize,
  StrategyPlaceOrderInput,
} from '@polytrader/shared';
import type {
  PolymarketRelayerApprovalInput,
  PolymarketRelayerMergeInput,
  PolymarketRelayerRedeemInput,
  PolymarketRelayerSplitInput,
  PolymarketRelayerSubmitResult,
  PolymarketRelayerTransferPusdInput,
} from '../relayer/index.js';

type TickSize = SupportedPriceTickSize;

interface PolymarketWalletCredentials {
  id?: string;
  privateKey: string;
  apiKey: string;
  secret: string;
  passphrase: string;
  depositWalletAddress: string;
  signatureType?: number;
  chainId?: number;
  clobHost?: string;
  relayerApiBaseUrl?: string;
}

interface NormalizedPolymarketWalletCredentials {
  id?: string;
  privateKey: `0x${string}`;
  apiKey: string;
  secret: string;
  passphrase: string;
  depositWalletAddress: string;
  signatureType: number;
  chainId: number;
  clobHost: string;
  relayerApiBaseUrl?: string;
}

interface PolymarketAccount {
  readonly walletId: string | undefined;
  readonly depositWalletAddress: string;
  getRelayerNonce(): Promise<string>;
  deploy(): Promise<PolymarketRelayerSubmitResult>;
  approval(input: PolymarketRelayerApprovalInput): Promise<PolymarketRelayerSubmitResult>;
  split(input: PolymarketRelayerSplitInput): Promise<PolymarketRelayerSubmitResult>;
  merge(input: PolymarketRelayerMergeInput): Promise<PolymarketRelayerSubmitResult>;
  redeem(input: PolymarketRelayerRedeemInput): Promise<PolymarketRelayerSubmitResult>;
  transferPusd(input: PolymarketRelayerTransferPusdInput): Promise<PolymarketRelayerSubmitResult>;
  listOpenOrders(params?: Record<string, unknown>): Promise<ClobOrder[]>;
  getOrder(orderId: string): Promise<ClobOrder | null>;
  listTrades(params?: Record<string, unknown>): Promise<ClobTrade[]>;
  fetchPositions(): Promise<DataPosition[]>;
  cancelOrder(orderId: string): Promise<OrderCancellationResult>;
  cancelOrders(orderIds: string[]): Promise<OrderCancellationResult>;
  cancelAllOrders(): Promise<OrderCancellationResult>;
  postHeartbeat(heartbeatId?: string): Promise<unknown>;
  getBalanceAllowance(): Promise<BalanceAllowance>;
  placeOrder(input: StrategyPlaceOrderInput): Promise<unknown>;
}

export type {
  NormalizedPolymarketWalletCredentials,
  PolymarketAccount,
  PolymarketWalletCredentials,
  TickSize,
};
