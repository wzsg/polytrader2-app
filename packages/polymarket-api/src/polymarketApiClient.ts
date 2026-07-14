import { ClobClient, SignatureTypeV2, type ApiKeyCreds } from '@polymarket/clob-client-v2';
import { RelayClient } from '@polymarket/builder-relayer-client';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon } from 'viem/chains';
import { PolymarketAccountImpl } from './account/index.js';
import { PolymarketBridgeApiClient } from './bridge/index.js';
import { PolymarketClobApiClient } from './clob/index.js';
import { PolymarketDataApiClient } from './data/index.js';
import { TradingApiClient } from './trading-api/tradingApiClient.js';
import { PolymarketGammaApiClient } from './gamma/index.js';
import { R2EventSnapshotClient } from './r2/index.js';
import { PolymarketRelayerApiClient } from './relayer/index.js';
import type {
  MarketTradeStreamEvent,
  MarketTradeStreamOptions,
  PriceHistoryStreamPage,
} from './gamma/index.js';
import type {
  PolymarketBridgeAddressResponse,
  PolymarketBridgeDepositInput,
  PolymarketBridgeQuoteInput,
  PolymarketBridgeQuoteResponse,
  PolymarketBridgeSupportedAssetsResponse,
  PolymarketBridgeTransactionStatusResponse,
  PolymarketBridgeWithdrawalInput,
} from './bridge/index.js';
import type { PolymarketRelayerSubmitResult } from './relayer/index.js';
import type {
  DataPosition,
  AppLocale,
  GammaEventRaw,
  MarketTradeTick,
  PolymarketAccountCredentialDerivationInput,
  PolymarketAccountCredentialDerivationResult,
  PriceHistoryPoint,
  SportsMetadataRaw,
} from '@polytrader/shared';
import { POLYMARKET_CLOB_BASE_URL, POLYMARKET_RELAYER_BASE_URL } from '@polytrader/shared';
import type { PolymarketAccount, PolymarketWalletCredentials } from './account/index.js';
import type { PolymarketApiClientOptions } from './types.js';

const DEFAULT_CHAIN_ID = 137;
const DEFAULT_APPROVAL_REGISTRY_RETRY_ATTEMPTS = 30;
const DEFAULT_APPROVAL_REGISTRY_RETRY_INTERVAL_MS = 2000;

class PolymarketApiClient {
  private static _instance?: PolymarketApiClient;

  private readonly _bridgeClient: PolymarketBridgeApiClient;
  private readonly _clobMarketDataClient: PolymarketClobApiClient;
  private readonly _dataApiClient: PolymarketDataApiClient;
  private readonly _eventSnapshotClient: R2EventSnapshotClient;
  private readonly _gammaClient: PolymarketGammaApiClient;
  private readonly _tradingApiClient: TradingApiClient;
  private readonly _polymarketAccounts: Map<string, PolymarketAccount>;

  private constructor(options: PolymarketApiClientOptions = {}) {
    this._bridgeClient = new PolymarketBridgeApiClient(options.bridgeApiBaseUrl);
    this._clobMarketDataClient = new PolymarketClobApiClient(options.clobBaseUrl);
    this._dataApiClient = new PolymarketDataApiClient(options.dataApiBaseUrl);
    this._eventSnapshotClient = new R2EventSnapshotClient(options.eventSnapshotBaseUrl);
    this._gammaClient = new PolymarketGammaApiClient(options.gammaProxyBaseUrl);
    this._tradingApiClient = new TradingApiClient(options.tradingApiBaseUrl);
    this._polymarketAccounts = new Map();
  }

  public static getInstance(): PolymarketApiClient {
    if (!PolymarketApiClient._instance) {
      PolymarketApiClient._instance = new PolymarketApiClient();
    }
    return PolymarketApiClient._instance;
  }

  public getPolymarketAccount(credentials: PolymarketWalletCredentials): PolymarketAccount {
    const key = this.buildAccountCacheKey(credentials);
    const cached = this._polymarketAccounts.get(key);
    if (cached) return cached;

    const account = new PolymarketAccountImpl(credentials, this._dataApiClient);
    this._polymarketAccounts.set(key, account);
    return account;
  }

  public deployDepositWallet(
    credentials: PolymarketWalletCredentials,
  ): Promise<PolymarketRelayerSubmitResult> {
    const relayerApiClient = new PolymarketRelayerApiClient(credentials);
    return relayerApiClient.deploy();
  }

  public async approvePolymarket(
    credentials: PolymarketWalletCredentials,
  ): Promise<PolymarketRelayerSubmitResult> {
    const relayerApiClient = new PolymarketRelayerApiClient(credentials);
    let lastRegistryError: unknown = null;
    for (let attempt = 0; attempt < DEFAULT_APPROVAL_REGISTRY_RETRY_ATTEMPTS; attempt++) {
      try {
        const nonce = await relayerApiClient.getNonce();
        return await relayerApiClient.approval({ nonce });
      } catch (error) {
        if (!this._isWalletRegistryValidationError(error)) throw error;
        lastRegistryError = error;
        if (attempt < DEFAULT_APPROVAL_REGISTRY_RETRY_ATTEMPTS - 1) {
          await this._sleep(DEFAULT_APPROVAL_REGISTRY_RETRY_INTERVAL_MS);
        }
      }
    }
    throw lastRegistryError;
  }

  public listBridgeSupportedAssets(): Promise<PolymarketBridgeSupportedAssetsResponse> {
    return this._bridgeClient.getSupportedAssets();
  }

  public createBridgeDeposit(
    input: PolymarketBridgeDepositInput,
  ): Promise<PolymarketBridgeAddressResponse> {
    return this._bridgeClient.createDeposit(input);
  }

  public createBridgeWithdrawal(
    input: PolymarketBridgeWithdrawalInput,
  ): Promise<PolymarketBridgeAddressResponse> {
    return this._bridgeClient.createWithdrawal(input);
  }

  public quoteBridgeTransfer(
    input: PolymarketBridgeQuoteInput,
  ): Promise<PolymarketBridgeQuoteResponse> {
    return this._bridgeClient.quote(input);
  }

  public getBridgeTransactionStatus(
    address: string,
  ): Promise<PolymarketBridgeTransactionStatusResponse> {
    return this._bridgeClient.getTransactionStatus(address);
  }

  public async derivePolymarketAccountCredentials(
    input: PolymarketAccountCredentialDerivationInput,
  ): Promise<PolymarketAccountCredentialDerivationResult> {
    const privateKey = this.normalizePrivateKey(input.privateKey);
    const account = privateKeyToAccount(privateKey);
    const chainId = input.chainId ?? DEFAULT_CHAIN_ID;
    if (chainId !== DEFAULT_CHAIN_ID) {
      throw new Error('Only Polygon mainnet chainId 137 is supported');
    }

    const signer = createWalletClient({
      account,
      chain: polygon,
      transport: http(),
    });
    const clobHost = input.clobHost?.trim() || POLYMARKET_CLOB_BASE_URL;
    const relayerUrl = input.relayerUrl?.trim() || POLYMARKET_RELAYER_BASE_URL;

    const relayer = new RelayClient(relayerUrl, chainId, signer);
    const depositWalletAddress = await this._deriveDepositWalletAddress(relayer);

    const clob = new ClobClient({
      host: clobHost,
      chain: chainId,
      signer,
      useServerTime: true,
      throwOnError: true,
    });
    const creds = await this._createApiKeyCredentials(clob, input.nonce);

    return {
      walletAddress: account.address,
      apiKey: creds.key,
      secret: creds.secret,
      passphrase: creds.passphrase,
      depositWalletAddress,
      signatureType: SignatureTypeV2.POLY_1271,
      chainId,
      clobHost,
    };
  }

  public fetchLocalizedEventById(eventId: string, locale: AppLocale): Promise<GammaEventRaw> {
    return this._tradingApiClient.fetchEventById(eventId, locale);
  }

  public fetchLocalizedMarketById(
    marketId: string,
    locale: AppLocale,
  ): ReturnType<TradingApiClient['fetchMarketById']> {
    return this._tradingApiClient.fetchMarketById(marketId, locale);
  }

  public fetchSportsMetadata(): Promise<SportsMetadataRaw[]> {
    return this._gammaClient.fetchSportsMetadata();
  }

  public fetchEventsBySearchParams(
    searchParams: URLSearchParams,
    signal?: AbortSignal,
  ): Promise<GammaEventRaw[]> {
    return this._gammaClient.fetchEventsBySearchParams(searchParams, signal);
  }

  public fetchEventsKeyset(
    searchParams: URLSearchParams,
    signal: AbortSignal,
  ): Promise<{ events: GammaEventRaw[]; nextCursor?: string }> {
    return this._gammaClient.fetchEventsKeyset(searchParams, signal);
  }

  public streamOpenEvents(
    signal: AbortSignal,
    locale: AppLocale = 'en-US',
    batchSize?: number,
  ): AsyncGenerator<{ events: GammaEventRaw[]; totalEvents?: number }> {
    return this._eventSnapshotClient.streamOpenEvents(signal, locale, batchSize);
  }

  public streamEventsByIds(
    ids: string[],
    signal: AbortSignal,
  ): AsyncGenerator<{ events: GammaEventRaw[]; ids?: string[] }> {
    return this._gammaClient.streamEventsByIds(ids, signal);
  }

  public fetchPositionsByUser(user: string): Promise<DataPosition[]> {
    return this._dataApiClient.fetchPositionsByUser(user);
  }

  public fetchMarketHolders(conditionId: string, limit = 20): Promise<unknown[]> {
    return this._dataApiClient.fetchMarketHolders(conditionId, limit);
  }

  public fetchMarketTrades(
    conditionId: string,
    limit = 200,
    offset = 0,
  ): Promise<MarketTradeTick[]> {
    return this._dataApiClient.fetchMarketTrades(conditionId, limit, offset);
  }

  public streamMarketTrades(
    conditionId: string,
    options: MarketTradeStreamOptions = {},
    signal?: AbortSignal,
  ): AsyncGenerator<MarketTradeStreamEvent> {
    return this._gammaClient.streamMarketTrades(conditionId, options, signal);
  }

  public fetchOrderBooks(tokenIds: string[]): Promise<unknown[]> {
    return this._clobMarketDataClient.fetchOrderBooks(tokenIds);
  }

  public fetchLastTradePrices(tokenIds: string[]): Promise<unknown[]> {
    return this._clobMarketDataClient.fetchLastTradePrices(tokenIds);
  }

  public fetchPriceHistory(
    tokenId: string,
    interval = '1d',
    fidelity = 5,
    signal?: AbortSignal,
  ): Promise<PriceHistoryPoint[]> {
    return this.collectPriceHistory([tokenId], interval, fidelity, signal).then(
      (history) => history[tokenId] ?? [],
    );
  }

  public fetchBatchPriceHistory(
    tokenIds: string[],
    interval = '1d',
    fidelity = 5,
    signal?: AbortSignal,
  ): Promise<Record<string, PriceHistoryPoint[]>> {
    return this.collectPriceHistory(tokenIds, interval, fidelity, signal);
  }

  public streamPriceHistory(
    tokenIds: string[],
    interval = '1d',
    fidelity = 5,
    signal?: AbortSignal,
  ): AsyncGenerator<PriceHistoryStreamPage> {
    return this._gammaClient.streamPriceHistory(tokenIds, interval, fidelity, signal);
  }

  private normalizePrivateKey(privateKey: string): `0x${string}` {
    const trimmed = privateKey.trim();
    if (!trimmed) throw new Error('Private key is required');
    return (trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`) as `0x${string}`;
  }

  private async _deriveDepositWalletAddress(relayer: RelayClient): Promise<string> {
    try {
      return await relayer.deriveDepositWalletAddress();
    } catch (error) {
      throw this._stageError('Failed to derive Polymarket deposit wallet', error);
    }
  }

  private async _createApiKeyCredentials(clob: ClobClient, nonce?: number): Promise<ApiKeyCreds> {
    try {
      const creds = await clob.createApiKey(nonce);
      this._assertApiKeyCredentials(creds);
      return creds;
    } catch (error) {
      if (!this._isApiKeyAlreadyCreatedError(error)) {
        throw this._stageError('Failed to create Polymarket API Key', error);
      }
    }

    try {
      const creds = await clob.deriveApiKey(nonce);
      this._assertApiKeyCredentials(creds);
      return creds;
    } catch (error) {
      throw this._stageError('Failed to derive Polymarket API Key', error);
    }
  }

  private _assertApiKeyCredentials(creds: Partial<ApiKeyCreds>): asserts creds is ApiKeyCreds {
    if (creds.key?.trim() && creds.secret?.trim() && creds.passphrase?.trim()) return;
    throw new Error('Server did not return a complete key, secret, and passphrase');
  }

  private _isApiKeyAlreadyCreatedError(error: unknown): boolean {
    return (
      this._hasNumericStatus(error) &&
      error.status === 400 &&
      this._errorMessage(error).toLowerCase().includes('could not create api key')
    );
  }

  private _stageError(stage: string, error: unknown): Error {
    const message = this._errorMessage(error);
    if (message.startsWith(`${stage}: `)) return new Error(message);
    return new Error(`${stage}: ${message}`);
  }

  private _errorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) return error.message.trim();
    if (typeof error === 'string' && error.trim()) return error.trim();
    if (this._hasStringMessage(error)) return error.message.trim();
    if (this._hasStringError(error)) return error.error.trim();
    return 'Unknown error';
  }

  private _hasStringMessage(error: unknown): error is { message: string } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof error.message === 'string' &&
      Boolean(error.message.trim())
    );
  }

  private _hasStringError(error: unknown): error is { error: string } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'error' in error &&
      typeof error.error === 'string' &&
      Boolean(error.error.trim())
    );
  }

  private _hasNumericStatus(error: unknown): error is { status: number } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      typeof error.status === 'number'
    );
  }

  private _isWalletRegistryValidationError(error: unknown): boolean {
    return this._errorMessage(error).includes('wallet registry validation failed');
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private async collectPriceHistory(
    tokenIds: string[],
    interval: string,
    fidelity: number,
    signal?: AbortSignal,
  ): Promise<Record<string, PriceHistoryPoint[]>> {
    const normalizedTokenIds = this.normalizeTokenIds(tokenIds);
    const result: Record<string, PriceHistoryPoint[]> = Object.fromEntries(
      normalizedTokenIds.map((tokenId) => [tokenId, []]),
    );
    if (!normalizedTokenIds.length) return result;

    for await (const page of this.streamPriceHistory(
      normalizedTokenIds,
      interval,
      fidelity,
      signal,
    )) {
      result[page.tokenId] = [...(result[page.tokenId] ?? []), ...page.points].sort(
        (a, b) => a.t - b.t,
      );
    }

    return result;
  }

  private normalizeTokenIds(tokenIds: string[]): string[] {
    return [...new Set(tokenIds.map((tokenId) => String(tokenId || '').trim()).filter(Boolean))];
  }

  private buildAccountCacheKey(credentials: PolymarketWalletCredentials): string {
    return [
      credentials.id || '',
      credentials.apiKey,
      credentials.depositWalletAddress,
      credentials.signatureType,
      credentials.chainId,
      credentials.clobHost,
    ].join(':');
  }
}

export { PolymarketApiClient };
