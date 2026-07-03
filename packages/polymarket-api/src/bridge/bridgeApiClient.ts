import { POLYTRADER_BRIDGE_API_BASE_URL } from '@polytrader/shared';
import type {
  PolymarketBridgeAddressResponse,
  PolymarketBridgeDepositInput,
  PolymarketBridgeQuoteInput,
  PolymarketBridgeQuoteResponse,
  PolymarketBridgeSupportedAssetsResponse,
  PolymarketBridgeTransactionStatusResponse,
  PolymarketBridgeWithdrawalInput,
} from './types.js';

class PolymarketBridgeApiClient {
  private readonly _baseUrl: string;

  public constructor(baseUrl = POLYTRADER_BRIDGE_API_BASE_URL) {
    this._baseUrl = this._trimTrailingSlash(baseUrl);
  }

  public getSupportedAssets(): Promise<PolymarketBridgeSupportedAssetsResponse> {
    return this._getJson('/supported-assets');
  }

  public createDeposit(
    input: PolymarketBridgeDepositInput,
  ): Promise<PolymarketBridgeAddressResponse> {
    return this._postJson('/deposit', this._normalizeDepositInput(input));
  }

  public createWithdrawal(
    input: PolymarketBridgeWithdrawalInput,
  ): Promise<PolymarketBridgeAddressResponse> {
    return this._postJson('/withdraw', this._normalizeWithdrawalInput(input));
  }

  public quote(input: PolymarketBridgeQuoteInput): Promise<PolymarketBridgeQuoteResponse> {
    return this._postJson('/quote', this._normalizeQuoteInput(input));
  }

  public getTransactionStatus(address: string): Promise<PolymarketBridgeTransactionStatusResponse> {
    const normalized = this._requireText(address, 'Bridge address');
    return this._getJson(`/status/${encodeURIComponent(normalized)}`);
  }

  private _normalizeDepositInput(
    input: PolymarketBridgeDepositInput,
  ): PolymarketBridgeDepositInput {
    return {
      address: this._requireEvmAddress(input.address, 'Polymarket wallet address'),
    };
  }

  private _normalizeWithdrawalInput(
    input: PolymarketBridgeWithdrawalInput,
  ): PolymarketBridgeWithdrawalInput {
    return {
      address: this._requireEvmAddress(input.address, 'Polymarket wallet address'),
      toChainId: this._requireText(input.toChainId, 'Destination chain ID'),
      toTokenAddress: this._requireText(input.toTokenAddress, 'Destination token address'),
      recipientAddr: this._requireText(input.recipientAddr, 'Recipient address'),
    };
  }

  private _normalizeQuoteInput(input: PolymarketBridgeQuoteInput): PolymarketBridgeQuoteInput {
    return {
      fromAmountBaseUnit: this._requireUnsignedInteger(input.fromAmountBaseUnit, 'Amount'),
      fromChainId: this._requireText(input.fromChainId, 'Source chain ID'),
      fromTokenAddress: this._requireText(input.fromTokenAddress, 'Source token address'),
      recipientAddress: this._requireText(input.recipientAddress, 'Recipient address'),
      toChainId: this._requireText(input.toChainId, 'Destination chain ID'),
      toTokenAddress: this._requireText(input.toTokenAddress, 'Destination token address'),
    };
  }

  private async _getJson<T>(path: string): Promise<T> {
    const response = await fetch(`${this._baseUrl}${path}`);
    return this._readJsonResponse(response);
  }

  private async _postJson<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this._baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return this._readJsonResponse(response);
  }

  private async _readJsonResponse<T>(response: Response): Promise<T> {
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`Polymarket bridge API request failed: HTTP ${response.status} ${body}`);
    }
    if (!body.trim()) return {} as T;
    return JSON.parse(body) as T;
  }

  private _requireEvmAddress(value: string, name: string): string {
    const normalized = this._requireText(value, name);
    if (!/^0x[a-fA-F0-9]{40}$/.test(normalized)) throw new Error(`${name} must be an EVM address`);
    return normalized;
  }

  private _requireUnsignedInteger(value: string, name: string): string {
    const normalized = this._requireText(value, name);
    if (!/^\d+$/.test(normalized) || BigInt(normalized) <= 0n) {
      throw new Error(`${name} must be a positive integer`);
    }
    return normalized;
  }

  private _requireText(value: string, name: string): string {
    const normalized = String(value ?? '').trim();
    if (!normalized) throw new Error(`${name} is required`);
    return normalized;
  }

  private _trimTrailingSlash(url: string): string {
    const normalized = this._requireText(url, 'Bridge API base URL');
    return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
  }
}

export { PolymarketBridgeApiClient };
