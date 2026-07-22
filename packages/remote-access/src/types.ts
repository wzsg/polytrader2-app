const REMOTE_ACCESS_PROTOCOL_VERSION = 1 as const;

type RemoteAccessOrderSide = 'BUY' | 'SELL';

interface RemoteAccessLimitOrderInput {
  assetId: string;
  side: RemoteAccessOrderSide;
  orderType: 'limit';
  price: number;
  shares: number;
  tickSize?: number;
  negRisk?: boolean;
  postOnly?: boolean;
  expiration?: number;
}

interface RemoteAccessMarketOrderInput {
  assetId: string;
  side: RemoteAccessOrderSide;
  orderType: 'market';
  amount: number;
  tickSize?: number;
  negRisk?: boolean;
  marketOrderType?: 'FOK' | 'FAK';
}

type RemoteAccessOrderInput = RemoteAccessLimitOrderInput | RemoteAccessMarketOrderInput;

interface RemoteAccessAuthParams {
  protocolVersion: typeof REMOTE_ACCESS_PROTOCOL_VERSION;
  deviceId: string;
  token: string;
}

interface RemoteAccessWalletIdParams {
  walletId: string;
}

interface RemoteAccessOrderListParams extends RemoteAccessWalletIdParams {
  limit?: number;
  offset?: number;
}

interface RemoteAccessOrderPlaceParams extends RemoteAccessWalletIdParams {
  order: RemoteAccessOrderInput;
}

interface RemoteAccessOrderCancelParams extends RemoteAccessWalletIdParams {
  orderId: string;
}

type RemoteAccessRequest =
  | { id: string; method: 'auth'; params: RemoteAccessAuthParams }
  | { id: string; method: 'ping'; params: Record<string, never> }
  | { id: string; method: 'wallet.list'; params: Record<string, never> }
  | { id: string; method: 'wallet.getBalance'; params: RemoteAccessWalletIdParams }
  | { id: string; method: 'order.list'; params: RemoteAccessOrderListParams }
  | { id: string; method: 'order.place'; params: RemoteAccessOrderPlaceParams }
  | { id: string; method: 'order.cancel'; params: RemoteAccessOrderCancelParams };

type RemoteAccessMethod = RemoteAccessRequest['method'];
type RemoteAccessWriteMethod = Extract<RemoteAccessMethod, 'order.place' | 'order.cancel'>;

interface RemoteAccessSuccessResponse {
  id: string;
  ok: true;
  data: unknown;
}

interface RemoteAccessFailureResponse {
  id: string;
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

type RemoteAccessResponse = RemoteAccessSuccessResponse | RemoteAccessFailureResponse;

interface RemoteAccessWalletSummary {
  id: string;
  name: string;
  walletAddress: string;
  depositWalletAddress: string;
  isDefault: boolean;
  credentialsConfigured: boolean;
  initializationStatus: string;
}

interface RemoteAccessWalletBalance {
  walletId: string;
  walletAddress: string | null;
  balance: string;
  balanceUsd: string;
  allowances: Array<{
    address: string;
    label: string;
    raw: string;
    formatted: string;
  }>;
  updatedAt: string;
}

interface RemoteAccessRequestContext {
  deviceId: string;
  requestId: string;
}

interface RemoteAccessAuthenticator {
  authenticate(params: RemoteAccessAuthParams): boolean | Promise<boolean>;
}

interface RemoteAccessHandlers {
  listWallets(context: RemoteAccessRequestContext): Promise<RemoteAccessWalletSummary[]>;
  getWalletBalance(
    params: RemoteAccessWalletIdParams,
    context: RemoteAccessRequestContext,
  ): Promise<RemoteAccessWalletBalance>;
  listOrders(
    params: RemoteAccessOrderListParams,
    context: RemoteAccessRequestContext,
  ): Promise<unknown[]>;
  placeOrder(
    params: RemoteAccessOrderPlaceParams,
    context: RemoteAccessRequestContext,
  ): Promise<unknown>;
  cancelOrder(
    params: RemoteAccessOrderCancelParams,
    context: RemoteAccessRequestContext,
  ): Promise<unknown>;
}

interface RemoteAccessConfirmationRequest {
  deviceId: string;
  requestId: string;
  method: RemoteAccessWriteMethod;
  params: RemoteAccessOrderPlaceParams | RemoteAccessOrderCancelParams;
}

interface RemoteAccessConfirmationProvider {
  confirm(request: RemoteAccessConfirmationRequest): boolean | Promise<boolean>;
}

interface RemoteAccessServerOptions {
  port: number;
  host?: string;
  path?: string;
  authenticator: RemoteAccessAuthenticator;
  handlers: RemoteAccessHandlers;
  confirmationProvider?: RemoteAccessConfirmationProvider;
  requireConfirmationForWrites?: boolean;
  responseCacheTtlMs?: number;
  maxCachedRequests?: number;
  maxPayloadBytes?: number;
  heartbeatIntervalMs?: number;
  onWarning?: (message: string, reason?: unknown) => void;
}

interface RemoteAccessServerAddress {
  host: string;
  port: number;
  path: string;
}

export { REMOTE_ACCESS_PROTOCOL_VERSION };
export type {
  RemoteAccessAuthenticator,
  RemoteAccessAuthParams,
  RemoteAccessConfirmationProvider,
  RemoteAccessConfirmationRequest,
  RemoteAccessFailureResponse,
  RemoteAccessHandlers,
  RemoteAccessLimitOrderInput,
  RemoteAccessMarketOrderInput,
  RemoteAccessMethod,
  RemoteAccessOrderCancelParams,
  RemoteAccessOrderInput,
  RemoteAccessOrderListParams,
  RemoteAccessOrderPlaceParams,
  RemoteAccessRequest,
  RemoteAccessRequestContext,
  RemoteAccessResponse,
  RemoteAccessServerAddress,
  RemoteAccessServerOptions,
  RemoteAccessSuccessResponse,
  RemoteAccessWalletBalance,
  RemoteAccessWalletIdParams,
  RemoteAccessWalletSummary,
  RemoteAccessWriteMethod,
};
