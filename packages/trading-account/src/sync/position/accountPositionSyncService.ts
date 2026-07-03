import type {
  AccountDataRepository,
  PolymarketWalletPositionSummary,
} from '@polytrader/repository-contract';
import type { DataPosition } from '@polytrader/shared';
import type { AccountDataSyncClient, AccountSyncCredential } from '../tradingAccountSyncService.js';

interface TradingAccountPositionSyncResult {
  positionsChanged: boolean;
  positionSummaryChanged: boolean;
  positionSummary: PolymarketWalletPositionSummary;
}

interface TradingAccountPositionSummaryWriter {
  updatePositionSummary(
    walletId: string,
    summary: PolymarketWalletPositionSummary,
  ): Promise<boolean>;
}

interface TradingAccountPositionSyncServiceOptions {
  accountRepository: AccountDataRepository;
  positionSummaryWriter: TradingAccountPositionSummaryWriter;
  client: AccountDataSyncClient;
  onWarning: (message: string, reason: unknown) => void;
}

class TradingAccountPositionSyncService {
  private readonly _accountRepository: AccountDataRepository;
  private readonly _positionSummaryWriter: TradingAccountPositionSummaryWriter;
  private readonly _client: AccountDataSyncClient;
  private readonly _onWarning: (message: string, reason: unknown) => void;

  public constructor(options: TradingAccountPositionSyncServiceOptions) {
    this._accountRepository = options.accountRepository;
    this._positionSummaryWriter = options.positionSummaryWriter;
    this._client = options.client;
    this._onWarning = options.onWarning;
  }

  public async sync(account: AccountSyncCredential): Promise<TradingAccountPositionSyncResult> {
    const previousPositionsFingerprint = await this._positionsFingerprint(account.id);
    try {
      const positions = await this._client.fetchPositionsByUser(
        account.depositWalletAddress.trim(),
      );
      await this._accountRepository.upsertWalletPositions(account.id, positions);
      const nextPositionsFingerprint = await this._positionsFingerprint(account.id);
      const positionSummary = this._positionSummary(
        await this._accountRepository.listCachedPositions(account.id),
      );
      const positionSummaryChanged = await this._positionSummaryWriter.updatePositionSummary(
        account.id,
        positionSummary,
      );
      return {
        positionsChanged: nextPositionsFingerprint !== previousPositionsFingerprint,
        positionSummaryChanged,
        positionSummary,
      };
    } catch (reason) {
      this._onWarning(`Failed to sync account positions: ${account.name}`, reason);
      return {
        positionsChanged: false,
        positionSummaryChanged: false,
        positionSummary: {
          positionsTotalValue: null,
          positionsInitialValue: null,
        },
      };
    }
  }

  private async _positionsFingerprint(walletId: string): Promise<string> {
    return this._stableStringify(await this._accountRepository.listCachedPositions(walletId));
  }

  private _stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this._stableStringify(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
      return `{${Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => `${JSON.stringify(key)}:${this._stableStringify(item)}`)
        .join(',')}}`;
    }
    return JSON.stringify(value);
  }

  private _positionSummary(positions: DataPosition[]): PolymarketWalletPositionSummary {
    return {
      positionsTotalValue: this._sumFinite(positions.map((position) => position.currentValue)),
      positionsInitialValue: this._sumFinite(positions.map((position) => position.initialValue)),
    };
  }

  private _sumFinite(values: Array<number | undefined>): number {
    return values.reduce<number>((total, value) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? total + numeric : total;
    }, 0);
  }
}

export { TradingAccountPositionSyncService };
export type {
  TradingAccountPositionSummaryWriter,
  TradingAccountPositionSyncResult,
  TradingAccountPositionSyncServiceOptions,
};
