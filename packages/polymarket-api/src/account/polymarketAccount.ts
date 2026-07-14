import {
  AssetType,
  ClobClient,
  COLLATERAL_TOKEN_DECIMALS,
  getContractConfig,
  OrderType,
  Side,
} from '@polymarket/clob-client-v2';
import type { WalletClient } from 'viem';
import { createWalletClient, formatUnits, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon } from 'viem/chains';
import { PolymarketDataApiClient } from '../data/index.js';
import {
  PolymarketRelayerApiClient,
  type PolymarketRelayerApprovalInput,
  type PolymarketRelayerMergeInput,
  type PolymarketRelayerRedeemInput,
  type PolymarketRelayerSplitInput,
  type PolymarketRelayerSubmitResult,
  type PolymarketRelayerTransferPusdInput,
} from '../relayer/index.js';
import type {
  BalanceAllowance,
  ClobOrder,
  ClobTrade,
  DataPosition,
  StrategyPlaceOrderInput,
} from '@polytrader/shared';
import { normalizePriceTickSize, POLYMARKET_CLOB_BASE_URL } from '@polytrader/shared';
import type {
  NormalizedPolymarketWalletCredentials,
  PolymarketAccount,
  PolymarketWalletCredentials,
  TickSize,
} from './types.js';

const DEFAULT_CHAIN_ID = 137;
class PolymarketAccountImpl implements PolymarketAccount {
  private readonly _client: ClobClient;
  private readonly _credentials: NormalizedPolymarketWalletCredentials;
  private readonly _dataApiClient: PolymarketDataApiClient;
  private readonly _relayerApiClient: PolymarketRelayerApiClient;

  public constructor(
    credentials: PolymarketWalletCredentials,
    dataApiClient: PolymarketDataApiClient = new PolymarketDataApiClient(),
  ) {
    this._credentials = this.normalizeCredentials(credentials);
    this._dataApiClient = dataApiClient;
    this._client = this.createClobClient();
    this._relayerApiClient = new PolymarketRelayerApiClient(this._credentials);
  }

  public get walletId(): string | undefined {
    return this._credentials.id;
  }

  public get depositWalletAddress(): string {
    return this._credentials.depositWalletAddress;
  }

  public getRelayerNonce(): Promise<string> {
    return this._relayerApiClient.getNonce();
  }

  public deploy(): Promise<PolymarketRelayerSubmitResult> {
    return this._relayerApiClient.deploy();
  }

  public approval(input: PolymarketRelayerApprovalInput): Promise<PolymarketRelayerSubmitResult> {
    return this._relayerApiClient.approval(input);
  }

  public split(input: PolymarketRelayerSplitInput): Promise<PolymarketRelayerSubmitResult> {
    return this._relayerApiClient.split(input);
  }

  public merge(input: PolymarketRelayerMergeInput): Promise<PolymarketRelayerSubmitResult> {
    return this._relayerApiClient.merge(input);
  }

  public redeem(input: PolymarketRelayerRedeemInput): Promise<PolymarketRelayerSubmitResult> {
    return this._relayerApiClient.redeem(input);
  }

  public transferPusd(
    input: PolymarketRelayerTransferPusdInput,
  ): Promise<PolymarketRelayerSubmitResult> {
    return this._relayerApiClient.transferPusd(input);
  }

  public listOpenOrders(params?: Record<string, unknown>): Promise<ClobOrder[]> {
    return this._client.getOpenOrders(params, false) as Promise<ClobOrder[]>;
  }

  public async getOrder(orderId: string): Promise<ClobOrder | null> {
    try {
      return (await this._client.getOrder(orderId)) as ClobOrder;
    } catch (error) {
      if (this.isNotFoundError(error)) return null;
      throw error;
    }
  }

  public listTrades(params?: Record<string, unknown>): Promise<ClobTrade[]> {
    return this._client.getTrades(params, false) as Promise<ClobTrade[]>;
  }

  public fetchPositions(): Promise<DataPosition[]> {
    return this._dataApiClient.fetchPositionsByUser(this._credentials.depositWalletAddress);
  }

  public cancelOrder(orderId: string): Promise<unknown> {
    return this._client.cancelOrder({ orderID: orderId });
  }

  public cancelOrders(orderIds: string[]): Promise<unknown> {
    return this._client.cancelOrders(orderIds);
  }

  public cancelAllOrders(): Promise<unknown> {
    return this._client.cancelAll();
  }

  public postHeartbeat(heartbeatId?: string): Promise<unknown> {
    return this._client.postHeartbeat(heartbeatId);
  }

  public async getBalanceAllowance(): Promise<BalanceAllowance> {
    const response = await this._client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
    const contractLabels = this.buildContractLabels();
    const balanceFormatted = this.formatCollateral(response.balance);

    const allowances = Object.entries(response.allowances || {}).map(([address, raw]) => ({
      address,
      label: contractLabels[address.toLowerCase()] || 'unknown',
      raw: String(raw),
      formatted: this.formatCollateral(String(raw)),
    }));

    return {
      walletAddress: this._credentials.depositWalletAddress,
      balance: response.balance,
      balanceUsd: Number(balanceFormatted).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      allowances,
    };
  }

  public async placeOrder(input: StrategyPlaceOrderInput): Promise<unknown> {
    return input.orderType === 'limit' ? this.postLimitOrder(input) : this.postMarketOrder(input);
  }

  private buildContractLabels(): Record<string, string> {
    const config = getContractConfig(this._credentials.chainId);
    const labels: Record<string, string> = {};
    for (const [name, address] of Object.entries(config)) {
      labels[address.toLowerCase()] = name;
    }
    return labels;
  }

  private createClobClient(): ClobClient {
    const signer = this.createSigner();

    return new ClobClient({
      host: this._credentials.clobHost,
      chain: this._credentials.chainId,
      signer,
      creds: {
        key: this._credentials.apiKey,
        secret: this._credentials.secret,
        passphrase: this._credentials.passphrase,
      },
      signatureType: this._credentials.signatureType,
      funderAddress: this._credentials.depositWalletAddress,
      useServerTime: true,
      throwOnError: true,
    });
  }

  private createSigner(): WalletClient {
    const account = privateKeyToAccount(this._credentials.privateKey);
    return createWalletClient({
      account,
      chain: polygon,
      transport: http(),
    }) as WalletClient;
  }

  private isNotFoundError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const status = (error as { status?: unknown }).status;
    return Number(status) === 404;
  }

  private formatCollateral(raw: string | undefined): string {
    return formatUnits(BigInt(raw || '0'), COLLATERAL_TOKEN_DECIMALS);
  }

  private normalizeCredentials(
    credentials: PolymarketWalletCredentials,
  ): NormalizedPolymarketWalletCredentials {
    const apiKey = credentials.apiKey.trim();
    const secret = credentials.secret.trim();
    const passphrase = credentials.passphrase.trim();
    const depositWalletAddress = credentials.depositWalletAddress.trim();
    if (!apiKey || !secret || !passphrase || !depositWalletAddress) {
      throw new Error(
        'This account is missing API Key, Secret, Passphrase, and Deposit Wallet Address, so it cannot be used for trading',
      );
    }

    return {
      id: credentials.id,
      privateKey: this.normalizePrivateKey(credentials.privateKey),
      apiKey,
      secret,
      passphrase,
      depositWalletAddress,
      signatureType: Number.isFinite(credentials.signatureType)
        ? Number(credentials.signatureType)
        : 3,
      chainId: Number.isFinite(credentials.chainId)
        ? Number(credentials.chainId)
        : DEFAULT_CHAIN_ID,
      clobHost: credentials.clobHost?.trim() || POLYMARKET_CLOB_BASE_URL,
      relayerApiBaseUrl: credentials.relayerApiBaseUrl?.trim() || undefined,
    };
  }

  private normalizeSide(side: StrategyPlaceOrderInput['side']): Side {
    return side === 'SELL' ? Side.SELL : Side.BUY;
  }

  private normalizePrivateKey(privateKey: string): `0x${string}` {
    const trimmed = privateKey.trim();
    if (!trimmed) throw new Error('Private key is required');
    return (trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`) as `0x${string}`;
  }

  private async orderOptions(input: StrategyPlaceOrderInput): Promise<{
    tickSize: TickSize;
    negRisk?: boolean;
  }> {
    const tickSize =
      this.normalizeTickSize(input.tickSize) || (await this._client.getTickSize(input.assetId));
    const negRisk = input.negRisk ?? (await this._client.getNegRisk(input.assetId));
    return { tickSize, negRisk };
  }

  private normalizeTickSize(value: unknown): TickSize | undefined {
    if (value == null) return undefined;
    const normalized = normalizePriceTickSize(value);
    if (normalized != null) return normalized;
    throw new Error(`Unsupported tick size: ${String(value)}`);
  }

  private async postLimitOrder(input: StrategyPlaceOrderInput): Promise<unknown> {
    if (input.orderType !== 'limit') throw new Error('Internal order type mismatch');

    const options = await this.orderOptions(input);
    return this._client.createAndPostOrder(
      {
        tokenID: input.assetId,
        price: input.price,
        size: input.shares,
        side: this.normalizeSide(input.side),
      },
      options,
      OrderType.GTC,
      input.postOnly === true,
    );
  }

  private async postMarketOrder(input: StrategyPlaceOrderInput): Promise<unknown> {
    if (input.orderType !== 'market') throw new Error('Internal order type mismatch');

    const options = await this.orderOptions(input);
    const orderType = input.marketOrderType === 'FAK' ? OrderType.FAK : OrderType.FOK;
    return this._client.createAndPostMarketOrder(
      {
        tokenID: input.assetId,
        amount: input.amount,
        side: this.normalizeSide(input.side),
        orderType,
      },
      options,
      orderType,
    );
  }
}

export { PolymarketAccountImpl };
