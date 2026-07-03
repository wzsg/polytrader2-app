import type { AccountDataRepository } from '@polytrader/repository-contract';
import type { ClobTrade } from '@polytrader/shared';
import type { AccountSyncCredential } from '../tradingAccountSyncService.js';

interface TradingAccountTradeSyncServiceOptions {
  accountRepository: AccountDataRepository;
}

class TradingAccountTradeSyncService {
  private readonly _accountRepository: AccountDataRepository;

  public constructor(options: TradingAccountTradeSyncServiceOptions) {
    this._accountRepository = options.accountRepository;
  }

  public async sync(account: AccountSyncCredential, trades: ClobTrade[]): Promise<boolean> {
    const previousTradesFingerprint = await this._tradesFingerprint(account.id);
    await this._accountRepository.upsertWalletTrades(account.id, trades);
    const nextTradesFingerprint = await this._tradesFingerprint(account.id);
    return nextTradesFingerprint !== previousTradesFingerprint;
  }

  private async _tradesFingerprint(walletId: string): Promise<string> {
    return this._stableStringify(await this._accountRepository.listCachedTrades(walletId));
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
}

export { TradingAccountTradeSyncService };
export type { TradingAccountTradeSyncServiceOptions };
