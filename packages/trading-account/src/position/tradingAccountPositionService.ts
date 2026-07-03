import type {
  TradingAccountPositionMergeInput,
  TradingAccountPositionOperationResult,
  TradingAccountPositionRedeemInput,
  TradingAccountPositionSplitInput,
} from '@polytrader/shared';
import type { TradingAccountPositionService } from '../types.js';

type HexString = `0x${string}`;

interface TradingAccountPositionCredential {
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

interface TradingAccountPositionCtfAmountInput {
  nonce: string;
  conditionId: HexString;
  amount: string;
  negRisk: boolean;
}

interface TradingAccountPositionRedeemSessionInput {
  nonce: string;
  conditionId: HexString;
  indexSets?: number[];
  negRisk: boolean;
}

interface TradingAccountPositionSession {
  getRelayerNonce(): Promise<string>;
  split(
    input: TradingAccountPositionCtfAmountInput,
  ): Promise<TradingAccountPositionOperationResult>;
  merge(
    input: TradingAccountPositionCtfAmountInput,
  ): Promise<TradingAccountPositionOperationResult>;
  redeem(
    input: TradingAccountPositionRedeemSessionInput,
  ): Promise<TradingAccountPositionOperationResult>;
}

interface TradingAccountPositionApiClient {
  getPolymarketAccount(credential: TradingAccountPositionCredential): TradingAccountPositionSession;
}

interface TradingAccountPositionCredentialProvider {
  getCredential(walletId: string): Promise<TradingAccountPositionCredential>;
}

interface TradingAccountPositionMarketReference {
  id: string;
  conditionId: string | null;
  negRisk: boolean;
}

interface TradingAccountPositionMarketResolver {
  getMarketByConditionId(
    conditionId: string,
  ): Promise<TradingAccountPositionMarketReference | null>;
}

interface TradingAccountPositionSyncScheduler {
  scheduleAccountSync(walletId: string): void;
}

interface TradingAccountPositionServiceOptions {
  apiClient: TradingAccountPositionApiClient;
  credentialProvider: TradingAccountPositionCredentialProvider;
  marketResolver: TradingAccountPositionMarketResolver;
}

interface TradingAccountPositionServiceImplOptions extends TradingAccountPositionServiceOptions {
  syncScheduler?: TradingAccountPositionSyncScheduler;
}

const CONDITION_ID_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const AMOUNT_PATTERN = /^\d+(?:\.\d{1,6})?$/;
const COLLATERAL_DECIMALS = 6;

class TradingAccountPositionServiceImpl implements TradingAccountPositionService {
  private readonly _apiClient: TradingAccountPositionApiClient;
  private readonly _credentialProvider: TradingAccountPositionCredentialProvider;
  private readonly _marketResolver: TradingAccountPositionMarketResolver;
  private readonly _syncScheduler: TradingAccountPositionSyncScheduler | null;

  public constructor(options: TradingAccountPositionServiceImplOptions) {
    this._apiClient = options.apiClient;
    this._credentialProvider = options.credentialProvider;
    this._marketResolver = options.marketResolver;
    this._syncScheduler = options.syncScheduler ?? null;
  }

  public async splitPosition(
    input: TradingAccountPositionSplitInput,
  ): Promise<TradingAccountPositionOperationResult> {
    const walletId = this._requireAccountId(input.walletId);
    const conditionId = this._requireConditionId(input.conditionId);
    const amount = this._collateralAmountBaseUnits(input.amount);
    const negRisk = await this._resolveNegRisk(conditionId, input.negRisk);
    const result = await this._withSession(walletId, async (session) => {
      const nonce = await session.getRelayerNonce();
      return session.split({
        nonce,
        conditionId,
        amount,
        negRisk,
      });
    });
    this._scheduleAccountSync(walletId);
    return result;
  }

  public async mergePositions(
    input: TradingAccountPositionMergeInput,
  ): Promise<TradingAccountPositionOperationResult> {
    const walletId = this._requireAccountId(input.walletId);
    const conditionId = this._requireConditionId(input.conditionId);
    const amount = this._collateralAmountBaseUnits(input.amount);
    const negRisk = await this._resolveNegRisk(conditionId, input.negRisk);
    const result = await this._withSession(walletId, async (session) => {
      const nonce = await session.getRelayerNonce();
      return session.merge({
        nonce,
        conditionId,
        amount,
        negRisk,
      });
    });
    this._scheduleAccountSync(walletId);
    return result;
  }

  public async redeemPositions(
    input: TradingAccountPositionRedeemInput,
  ): Promise<TradingAccountPositionOperationResult> {
    const walletId = this._requireAccountId(input.walletId);
    const conditionId = this._requireConditionId(input.conditionId);
    const indexSets = this._redeemIndexSets(input.indexSets);
    const negRisk = await this._resolveNegRisk(conditionId, input.negRisk);
    const result = await this._withSession(walletId, async (session) => {
      const nonce = await session.getRelayerNonce();
      return session.redeem({
        nonce,
        conditionId,
        indexSets,
        negRisk,
      });
    });
    this._scheduleAccountSync(walletId);
    return result;
  }

  private async _withSession<T>(
    walletId: string,
    operation: (session: TradingAccountPositionSession) => Promise<T>,
  ): Promise<T> {
    const credential = await this._credentialProvider.getCredential(walletId);
    const session = this._apiClient.getPolymarketAccount(credential);
    return operation(session);
  }

  private _requireAccountId(walletId: string): string {
    const normalized = String(walletId ?? '').trim();
    if (!normalized) throw new Error('Account ID is required');
    return normalized;
  }

  private _requireConditionId(conditionId: string): HexString {
    const normalized = String(conditionId ?? '').trim();
    if (!CONDITION_ID_PATTERN.test(normalized)) {
      throw new Error('Condition ID must be a 32-byte hex string');
    }
    return normalized as HexString;
  }

  private _collateralAmountBaseUnits(amount: string | number): string {
    const normalized = this._amountText(amount);
    const [integerPart, decimalPart = ''] = normalized.split('.');
    const paddedDecimalPart = decimalPart.padEnd(COLLATERAL_DECIMALS, '0');
    const baseUnits = `${integerPart}${paddedDecimalPart}`.replace(/^0+/, '') || '0';
    if (baseUnits === '0') throw new Error('Amount must be greater than 0');
    return baseUnits;
  }

  private _amountText(amount: string | number): string {
    const normalized = typeof amount === 'number' ? this._numberAmountText(amount) : amount.trim();
    if (!AMOUNT_PATTERN.test(normalized)) {
      throw new Error('Amount must be a positive decimal with at most 6 decimal places');
    }
    return normalized;
  }

  private _numberAmountText(amount: number): string {
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be greater than 0');
    return amount.toString();
  }

  private _redeemIndexSets(indexSets: number[] | undefined): number[] {
    const normalized = indexSets ?? [1, 2];
    if (!Array.isArray(normalized) || normalized.length === 0) {
      throw new Error('Redeem index sets are required');
    }
    for (const indexSet of normalized) {
      if (!Number.isInteger(indexSet) || indexSet <= 0) {
        throw new Error('Redeem index sets must be positive integers');
      }
    }
    return normalized;
  }

  private async _resolveNegRisk(
    conditionId: HexString,
    inputNegRisk: boolean | undefined,
  ): Promise<boolean> {
    if (typeof inputNegRisk === 'boolean') return inputNegRisk;
    const market = await this._marketResolver.getMarketByConditionId(conditionId);
    if (!market) throw new Error(`No market was found for condition ID: ${conditionId}`);
    return market.negRisk;
  }

  private _scheduleAccountSync(walletId: string): void {
    this._syncScheduler?.scheduleAccountSync(walletId);
  }
}

export { TradingAccountPositionServiceImpl };
export type {
  TradingAccountPositionApiClient,
  TradingAccountPositionCredential,
  TradingAccountPositionCredentialProvider,
  TradingAccountPositionMarketReference,
  TradingAccountPositionMarketResolver,
  TradingAccountPositionServiceImplOptions,
  TradingAccountPositionServiceOptions,
  TradingAccountPositionSession,
  TradingAccountPositionSyncScheduler,
};
