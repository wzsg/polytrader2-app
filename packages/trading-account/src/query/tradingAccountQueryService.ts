import type { AccountDataRepository } from '@polytrader/repository-contract';
import type {
  ApiResult,
  ClobOrder,
  ClobTrade,
  DataPosition,
  PolymarketWalletSummary,
  TradingAccountDataQuery,
  TradingRuntimeAccountState,
} from '@polytrader/shared';
import type { TradingAccountQueryService } from '../types.js';

const DEFAULT_TRADING_ACCOUNT_DATA_PAGE_SIZE = 500;
const MAX_TRADING_ACCOUNT_DATA_PAGE_SIZE = 1000;

type MaybePromise<T> = T | Promise<T>;

interface TradingAccountStateQueryOptions extends TradingAccountDataQuery {
  fallbackAccountId?: string;
}

interface TradingAccountPagination {
  limit: number;
  offset: number;
}

interface TradingAccountQueryCredential {
  id: string;
}

interface TradingAccountQueryProvider {
  listPolymarketWallets(): Promise<PolymarketWalletSummary[]>;
  getPolymarketWalletCredential(walletId: string): Promise<TradingAccountQueryCredential>;
  assertPolymarketWalletCredentialsConfigured(
    credential: TradingAccountQueryCredential,
  ): Promise<void>;
}

interface TradingAccountQueryServiceOptions {
  accountDataRepository: AccountDataRepository;
  accountProvider: TradingAccountQueryProvider;
}

class TradingAccountQueryServiceImpl implements TradingAccountQueryService {
  private readonly _accountDataRepository: AccountDataRepository;
  private readonly _accountProvider: TradingAccountQueryProvider;

  public constructor(options: TradingAccountQueryServiceOptions) {
    this._accountDataRepository = options.accountDataRepository;
    this._accountProvider = options.accountProvider;
  }

  public async queryAccount(
    options: TradingAccountStateQueryOptions = {},
  ): Promise<TradingRuntimeAccountState> {
    const accounts = await this._accountProvider.listPolymarketWallets();
    const tradableAccounts = accounts.filter((account) => account.credentialsConfigured);
    const current =
      options.walletId ||
      options.fallbackAccountId ||
      tradableAccounts.find((account) => account.isDefault)?.id ||
      tradableAccounts[0]?.id ||
      '';

    if (!current) {
      return {
        accounts,
        selectedWalletId: '',
        credentialsConfigured: false,
        positionsConfigured: false,
        balance: null,
        orders: [],
        positions: [],
        trades: [],
        error: accounts.length ? 'No tradable accounts' : '',
        updatedAt: this._now(),
      };
    }

    const dataQuery: TradingAccountDataQuery = {
      walletId: current,
      limit: options.limit,
      offset: options.offset,
    };
    if (Object.prototype.hasOwnProperty.call(options, 'conditionId')) {
      dataQuery.conditionId = options.conditionId;
    }
    const dataTasks: Array<Promise<ApiResult<unknown>>> = [
      this._wrapAccountCall(() => this.queryOrders(dataQuery)),
      this._wrapAccountCall(() => this.queryPositions(dataQuery)),
      this._wrapAccountCall(() => this.queryTrades(dataQuery)),
    ];

    const results = await Promise.all(dataTasks);
    const [ordersResult, positionsResult, tradesResult] = results as [
      ApiResult<ClobOrder[]>,
      ApiResult<DataPosition[]>,
      ApiResult<ClobTrade[]>,
    ];
    const firstError = [ordersResult, positionsResult, tradesResult].find((result) => !result.ok);
    const currentAccount = accounts.find((account) => account.id === current) ?? null;

    return {
      accounts,
      selectedWalletId: current,
      credentialsConfigured: await this._isAccountConfigured(current),
      positionsConfigured: await this._hasDepositWalletAddress(current),
      balance: options.includeBalance === false ? null : (currentAccount?.balance ?? null),
      orders: ordersResult.ok ? ordersResult.data : [],
      positions: positionsResult.ok ? positionsResult.data : [],
      trades: tradesResult.ok ? tradesResult.data : [],
      error: firstError && !firstError.ok ? firstError.error : '',
      updatedAt: this._now(),
    };
  }

  public async queryOrders(query: TradingAccountDataQuery = {}): Promise<ClobOrder[]> {
    if (this._hasBlankConditionId(query)) return [];
    const conditionId = this._normalizeConditionId(query.conditionId);
    const pagination = this._normalizePagination(query);
    if (query.walletId) {
      const orders = await this._accountDataRepository.listCachedOpenOrders(
        query.walletId,
        conditionId,
      );
      return this._paginate(this._sortOrdersByTimeDesc(orders), pagination);
    }
    if (!conditionId) return [];
    const walletOrders = await Promise.all(
      (await this._configuredAccounts()).map((account) =>
        this._accountDataRepository.listCachedOpenOrders(account.id, conditionId),
      ),
    );
    return this._paginate(this._sortOrdersByTimeDesc(walletOrders.flat()), pagination);
  }

  public async queryPositions(query: TradingAccountDataQuery = {}): Promise<DataPosition[]> {
    if (this._hasBlankConditionId(query)) return [];
    const conditionId = this._normalizeConditionId(query.conditionId);
    const pagination = this._normalizePagination(query);
    if (query.walletId) {
      const positions = await this._accountDataRepository.listCachedPositions(
        query.walletId,
        conditionId,
      );
      return this._paginate(positions, pagination);
    }
    if (!conditionId) return [];
    const walletPositions = await Promise.all(
      (await this._positionReadableAccounts()).map((account) =>
        this._accountDataRepository.listCachedPositions(account.id, conditionId),
      ),
    );
    return this._paginate(walletPositions.flat(), pagination);
  }

  public async queryTrades(query: TradingAccountDataQuery = {}): Promise<ClobTrade[]> {
    if (this._hasBlankConditionId(query)) return [];
    const conditionId = this._normalizeConditionId(query.conditionId);
    const pagination = this._normalizePagination(query);
    const readLimit = pagination.limit + pagination.offset;
    if (query.walletId) {
      const trades = await this._accountDataRepository.listCachedTrades(
        query.walletId,
        readLimit,
        conditionId,
      );
      return this._paginate(this._sortTradesByTimeDesc(trades), pagination);
    }
    if (!conditionId) return [];
    const walletTrades = await Promise.all(
      (await this._configuredAccounts()).map((account) =>
        this._accountDataRepository.listCachedTrades(account.id, readLimit, conditionId),
      ),
    );
    return this._paginate(this._sortTradesByTimeDesc(walletTrades.flat()), pagination);
  }

  private async _isAccountConfigured(walletId: string): Promise<boolean> {
    try {
      await this._accountProvider.assertPolymarketWalletCredentialsConfigured(
        await this._accountProvider.getPolymarketWalletCredential(walletId),
      );
      return true;
    } catch {
      return false;
    }
  }

  private _sortOrdersByTimeDesc(orders: ClobOrder[]): ClobOrder[] {
    return [...orders].sort(
      (left, right) => this._timeValue(right.created_at) - this._timeValue(left.created_at),
    );
  }

  private _sortTradesByTimeDesc(trades: ClobTrade[]): ClobTrade[] {
    return [...trades].sort(
      (left, right) => this._timeValue(right.match_time) - this._timeValue(left.match_time),
    );
  }

  private _timeValue(value: unknown): number {
    if (value == null) return 0;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private _normalizePagination(query: TradingAccountDataQuery): TradingAccountPagination {
    return {
      limit: Math.max(
        1,
        Math.min(
          Math.trunc(Number(query.limit)) || DEFAULT_TRADING_ACCOUNT_DATA_PAGE_SIZE,
          MAX_TRADING_ACCOUNT_DATA_PAGE_SIZE,
        ),
      ),
      offset: Math.max(0, Math.trunc(Number(query.offset)) || 0),
    };
  }

  private _paginate<T>(items: T[], pagination: TradingAccountPagination): T[] {
    return items.slice(pagination.offset, pagination.offset + pagination.limit);
  }

  private async _configuredAccounts(): Promise<PolymarketWalletSummary[]> {
    return (await this._accountProvider.listPolymarketWallets()).filter(
      (account) => account.credentialsConfigured,
    );
  }

  private async _positionReadableAccounts(): Promise<PolymarketWalletSummary[]> {
    return (await this._accountProvider.listPolymarketWallets()).filter((account) =>
      Boolean(account.depositWalletAddress.trim()),
    );
  }

  private async _hasDepositWalletAddress(walletId: string): Promise<boolean> {
    const account = (await this._accountProvider.listPolymarketWallets()).find(
      (item) => item.id === walletId,
    );
    return Boolean(account?.depositWalletAddress.trim());
  }

  private _hasBlankConditionId(query: TradingAccountDataQuery): boolean {
    return Object.prototype.hasOwnProperty.call(query, 'conditionId') && !query.conditionId?.trim();
  }

  private async _wrapAccountCall<T>(fn: () => MaybePromise<T>): Promise<ApiResult<T>> {
    try {
      return this._ok(await fn());
    } catch (error) {
      return this._err(error);
    }
  }

  private _ok<T>(data: T): ApiResult<T> {
    return { ok: true, data };
  }

  private _err(error: unknown): ApiResult<never> {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  private _normalizeConditionId(conditionId: string | undefined): string | undefined {
    return conditionId?.trim() || undefined;
  }

  private _now(): string {
    return new Date().toISOString();
  }
}

export { TradingAccountQueryServiceImpl };
export type {
  TradingAccountQueryCredential,
  TradingAccountQueryProvider,
  TradingAccountQueryServiceOptions,
  TradingAccountStateQueryOptions,
};
