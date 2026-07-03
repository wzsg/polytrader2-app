import { EventEmitter } from 'events';
import type {
  AccountDataRepository,
  PolymarketWalletPositionSummary,
} from '@polytrader/repository-contract';
import type { ApplicationEventBus } from '@polytrader/event-bus';
import type {
  BalanceAllowance,
  ClobOrder,
  ClobTrade,
  DataPosition,
  PolymarketWalletSummary,
} from '@polytrader/shared';
import type { TradingAccountSyncService } from '../types.js';
import type { TradingAccountSyncEventMap } from './tradingAccountSyncEvents.js';
import { TradingAccountOrderSyncService } from './order/index.js';
import { TradingAccountPositionSyncService } from './position/index.js';
import { TradingAccountTradeSyncService } from './trade/index.js';

const DEFAULT_ACCOUNT_DATA_SYNC_INTERVAL_MS = 5_000;
const DEFAULT_ACCOUNT_BALANCE_SYNC_INTERVAL_MS = 1_000;
const DEFAULT_SYNC_AFTER_ORDER_DELAY_MS = 500;

interface AccountSyncCredential {
  id: string;
  name: string;
  credentialsConfigured: boolean;
  depositWalletAddress: string;
}

interface AccountSyncCredentialProvider {
  getAccount(walletId: string): Promise<AccountSyncCredential>;
  listAccounts(): Promise<AccountSyncCredential[]>;
}

interface AccountDataSyncClient {
  getBalanceAllowance(walletId: string): Promise<BalanceAllowance>;
  listOpenOrders(walletId: string): Promise<ClobOrder[]>;
  getOrder(walletId: string, orderId: string): Promise<ClobOrder | null>;
  listTrades(walletId: string): Promise<ClobTrade[]>;
  fetchPositionsByUser(user: string): Promise<DataPosition[]>;
}

interface AccountBalanceWriter {
  updateBalance(walletId: string, balance: BalanceAllowance | null): Promise<boolean>;
}

interface TradingAccountPositionSummaryWriter {
  updatePositionSummary(
    walletId: string,
    summary: PolymarketWalletPositionSummary,
  ): Promise<boolean>;
}

interface AccountDataSyncIntervals {
  balanceMs?: number;
  ordersMs?: number;
  tradesMs?: number;
  positionsMs?: number;
}

interface TradingAccountSyncServiceOptions {
  accountRepository: AccountDataRepository;
  balanceWriter: AccountBalanceWriter;
  positionSummaryWriter: TradingAccountPositionSummaryWriter;
  credentialProvider: AccountSyncCredentialProvider;
  client: AccountDataSyncClient;
  eventBus?: ApplicationEventBus;
  syncIntervals?: AccountDataSyncIntervals;
  syncAfterOrderDelayMs?: number;
  onWarning?: (message: string, reason: unknown) => void;
}

type AccountDataSyncKind = 'balance' | 'orders' | 'trades' | 'positions';

class TradingAccountSyncServiceImpl
  extends EventEmitter<TradingAccountSyncEventMap>
  implements TradingAccountSyncService
{
  private readonly _accountRepository: AccountDataRepository;
  private readonly _balanceWriter: AccountBalanceWriter;
  private readonly _positionSummaryWriter: TradingAccountPositionSummaryWriter;
  private readonly _credentialProvider: AccountSyncCredentialProvider;
  private readonly _client: AccountDataSyncClient;
  private readonly _orderSyncService: TradingAccountOrderSyncService;
  private readonly _positionSyncService: TradingAccountPositionSyncService;
  private readonly _tradeSyncService: TradingAccountTradeSyncService;
  private readonly _syncIntervals: Required<AccountDataSyncIntervals>;
  private readonly _syncAfterOrderDelayMs: number;
  private readonly _onWarning: (message: string, reason: unknown) => void;
  private readonly _timers = new Map<AccountDataSyncKind, ReturnType<typeof setInterval>>();
  private readonly _scheduledSyncTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly _activeSyncKeys = new Set<string>();
  private readonly _removedWalletIds = new Set<string>();
  private readonly _unsubscribeApplicationEvents: Array<() => void> = [];
  private _isStarted = false;

  public constructor(options: TradingAccountSyncServiceOptions) {
    super();
    this._accountRepository = options.accountRepository;
    this._balanceWriter = options.balanceWriter;
    this._positionSummaryWriter = options.positionSummaryWriter;
    this._credentialProvider = options.credentialProvider;
    this._client = options.client;
    this._syncIntervals = {
      balanceMs: options.syncIntervals?.balanceMs ?? DEFAULT_ACCOUNT_BALANCE_SYNC_INTERVAL_MS,
      ordersMs: options.syncIntervals?.ordersMs ?? DEFAULT_ACCOUNT_DATA_SYNC_INTERVAL_MS,
      tradesMs: options.syncIntervals?.tradesMs ?? DEFAULT_ACCOUNT_DATA_SYNC_INTERVAL_MS,
      positionsMs: options.syncIntervals?.positionsMs ?? DEFAULT_ACCOUNT_DATA_SYNC_INTERVAL_MS,
    };
    this._syncAfterOrderDelayMs =
      options.syncAfterOrderDelayMs ?? DEFAULT_SYNC_AFTER_ORDER_DELAY_MS;
    this._onWarning = options.onWarning ?? (() => undefined);
    this._orderSyncService = new TradingAccountOrderSyncService({
      accountRepository: this._accountRepository,
      client: this._client,
      onWarning: this._onWarning,
    });
    this._positionSyncService = new TradingAccountPositionSyncService({
      accountRepository: this._accountRepository,
      positionSummaryWriter: this._positionSummaryWriter,
      client: this._client,
      onWarning: this._onWarning,
    });
    this._tradeSyncService = new TradingAccountTradeSyncService({
      accountRepository: this._accountRepository,
    });
    if (options.eventBus) this._wireApplicationEvents(options.eventBus);
  }

  public start(): void {
    if (this._timers.size > 0) return;
    this._isStarted = true;
    this._startSyncLoop('balance', this._syncIntervals.balanceMs);
    this._startSyncLoop('orders', this._syncIntervals.ordersMs);
    this._startSyncLoop('trades', this._syncIntervals.tradesMs);
    this._startSyncLoop('positions', this._syncIntervals.positionsMs);
  }

  public stop(): void {
    this._isStarted = false;
    for (const timer of this._timers.values()) clearInterval(timer);
    this._timers.clear();
    for (const timer of this._scheduledSyncTimers.values()) clearTimeout(timer);
    this._scheduledSyncTimers.clear();
  }

  public async syncAccountNow(walletId: string): Promise<void> {
    if (this._isWalletRemoved(walletId)) return;
    const account = await this._credentialProvider.getAccount(walletId);
    const tasks: Promise<void>[] = [];
    if (account.credentialsConfigured) {
      tasks.push(this._syncOne('balance', account));
      tasks.push(this._syncOne('orders', account));
      tasks.push(this._syncOne('trades', account));
    }
    if (account.depositWalletAddress.trim()) tasks.push(this._syncOne('positions', account));
    await Promise.all(tasks);
  }

  public scheduleAccountSync(walletId: string): void {
    if (!this._isStarted || this._isWalletRemoved(walletId)) return;
    const existing = this._scheduledSyncTimers.get(walletId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this._scheduledSyncTimers.delete(walletId);
      void this.syncAccountNow(walletId).catch((reason) => {
        this._onWarning(`Failed to run scheduled account sync: ${walletId}`, reason);
      });
    }, this._syncAfterOrderDelayMs);
    this._scheduledSyncTimers.set(walletId, timer);
  }

  private _startSyncLoop(kind: AccountDataSyncKind, delayMs: number): void {
    void this._syncAll(kind).catch((reason) => {
      this._onWarning(`Failed to run account ${kind} sync loop`, reason);
    });
    const timer = setInterval(() => {
      void this._syncAll(kind).catch((reason) => {
        this._onWarning(`Failed to run account ${kind} sync loop`, reason);
      });
    }, delayMs);
    this._timers.set(kind, timer);
  }

  private async _syncAll(kind: AccountDataSyncKind): Promise<void> {
    const accounts = await this._listAccountsForKind(kind);
    for (const account of accounts) {
      await this._syncOne(kind, account);
    }
  }

  private async _listAccountsForKind(kind: AccountDataSyncKind): Promise<AccountSyncCredential[]> {
    return (await this._credentialProvider.listAccounts()).filter((account) => {
      if (kind === 'positions') return Boolean(account.depositWalletAddress.trim());
      return account.credentialsConfigured;
    });
  }

  private async _syncOne(kind: AccountDataSyncKind, account: AccountSyncCredential): Promise<void> {
    if (this._isWalletRemoved(account.id)) return;
    const key = `${kind}:${account.id}`;
    if (this._activeSyncKeys.has(key)) return;
    this._activeSyncKeys.add(key);

    try {
      if (kind === 'balance') await this._syncBalance(account);
      if (kind === 'orders') await this._syncOrders(account);
      if (kind === 'trades') await this._syncTrades(account);
      if (kind === 'positions') await this._syncPositions(account);
    } finally {
      this._activeSyncKeys.delete(key);
    }
  }

  private async _syncBalance(account: AccountSyncCredential): Promise<void> {
    try {
      const balance = await this._client.getBalanceAllowance(account.id);
      if (this._isWalletRemoved(account.id)) return;
      const balanceChanged = await this._balanceWriter.updateBalance(account.id, balance);
      if (balanceChanged) {
        this.emit('balance-sync-event', {
          walletId: account.id,
          reason: 'sync-balance',
          balance,
          at: this._now(),
        });
      }
    } catch (reason) {
      this._onWarning(`Failed to sync account balance: ${account.name}`, reason);
    }
  }

  private async _syncOrders(account: AccountSyncCredential): Promise<void> {
    try {
      const orders = await this._client.listOpenOrders(account.id);
      if (this._isWalletRemoved(account.id)) return;
      const ordersChanged = await this._orderSyncService.sync(account, orders);
      if (ordersChanged) {
        this.emit('order-sync-event', {
          walletId: account.id,
          reason: 'sync-open-orders',
          at: this._now(),
        });
      }
    } catch (reason) {
      this._onWarning(`Failed to sync account orders: ${account.name}`, reason);
    }
  }

  private async _syncTrades(account: AccountSyncCredential): Promise<void> {
    try {
      const trades = await this._client.listTrades(account.id);
      if (this._isWalletRemoved(account.id)) return;
      const tradesChanged = await this._tradeSyncService.sync(account, trades);
      if (tradesChanged) {
        this.emit('trade-sync-event', {
          walletId: account.id,
          reason: 'sync-trades',
          at: this._now(),
        });
      }
    } catch (reason) {
      this._onWarning(`Failed to sync account trades: ${account.name}`, reason);
    }
  }

  private async _syncPositions(account: AccountSyncCredential): Promise<void> {
    if (this._isWalletRemoved(account.id)) return;
    const result = await this._positionSyncService.sync(account);
    if (result.positionsChanged) {
      this.emit('position-sync-event', {
        walletId: account.id,
        reason: 'sync-positions',
        at: this._now(),
      });
    }
    if (result.positionSummaryChanged) {
      this.emit('position-sync-event', {
        walletId: account.id,
        reason: 'sync-position-summary',
        positionsTotalValue: result.positionSummary.positionsTotalValue,
        positionsInitialValue: result.positionSummary.positionsInitialValue,
        at: this._now(),
      });
    }
  }

  private _now(): string {
    return new Date().toISOString();
  }

  private _wireApplicationEvents(eventBus: ApplicationEventBus): void {
    this._unsubscribeApplicationEvents.push(
      eventBus.subscribe('polymarket-wallet:created', (event) => {
        this._handleWalletAvailable(event.wallet);
      }),
      eventBus.subscribe('polymarket-wallet:updated', (event) => {
        this._handleWalletAvailable(event.wallet);
      }),
      eventBus.subscribe('polymarket-wallet:default-changed', (event) => {
        this._handleWalletAvailable(event.wallet);
      }),
      eventBus.subscribe('polymarket-wallet:deleted', (event) => {
        this._handleWalletDeleted(event.wallet.id);
      }),
    );
  }

  private _handleWalletAvailable(wallet: PolymarketWalletSummary): void {
    this._removedWalletIds.delete(wallet.id);
    if (this._walletRequiresSync(wallet)) this.scheduleAccountSync(wallet.id);
  }

  private _handleWalletDeleted(walletId: string): void {
    this._removedWalletIds.add(walletId);
    this._clearScheduledAccountSync(walletId);
    for (const key of [...this._activeSyncKeys]) {
      if (key.endsWith(`:${walletId}`)) this._activeSyncKeys.delete(key);
    }
  }

  private _clearScheduledAccountSync(walletId: string): void {
    const timer = this._scheduledSyncTimers.get(walletId);
    if (!timer) return;
    clearTimeout(timer);
    this._scheduledSyncTimers.delete(walletId);
  }

  private _walletRequiresSync(
    wallet: Pick<AccountSyncCredential, 'credentialsConfigured' | 'depositWalletAddress'>,
  ): boolean {
    return wallet.credentialsConfigured || Boolean(wallet.depositWalletAddress.trim());
  }

  private _isWalletRemoved(walletId: string): boolean {
    return this._removedWalletIds.has(walletId);
  }
}

export { TradingAccountSyncServiceImpl };
export type {
  AccountDataSyncClient,
  AccountDataSyncIntervals,
  AccountBalanceWriter,
  TradingAccountPositionSummaryWriter,
  AccountSyncCredential,
  AccountSyncCredentialProvider,
  TradingAccountSyncServiceOptions,
};
