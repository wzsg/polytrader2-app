import type { AccountDataRepository } from '@polytrader/repository-contract';
import type { AccountOrderStatus, ClobOrder } from '@polytrader/shared';
import type { AccountDataSyncClient, AccountSyncCredential } from '../tradingAccountSyncService.js';

interface TradingAccountOrderSyncServiceOptions {
  accountRepository: AccountDataRepository;
  client: AccountDataSyncClient;
  onWarning: (message: string, reason: unknown) => void;
}

class TradingAccountOrderSyncService {
  private readonly _accountRepository: AccountDataRepository;
  private readonly _client: AccountDataSyncClient;
  private readonly _onWarning: (message: string, reason: unknown) => void;

  public constructor(options: TradingAccountOrderSyncServiceOptions) {
    this._accountRepository = options.accountRepository;
    this._client = options.client;
    this._onWarning = options.onWarning;
  }

  public async sync(account: AccountSyncCredential, orders: ClobOrder[]): Promise<boolean> {
    const previousOpenOrdersFingerprint = await this._openOrdersFingerprint(account.id);
    const confirmedOrders = await this.confirmSnapshotCanceledOrders(account, orders);
    await this._accountRepository.upsertWalletOrders(account.id, confirmedOrders);
    await this.confirmMissingOpenOrders(account, this._exchangeOrderIds(confirmedOrders));
    const nextOpenOrdersFingerprint = await this._openOrdersFingerprint(account.id);
    return nextOpenOrdersFingerprint !== previousOpenOrdersFingerprint;
  }

  private async confirmSnapshotCanceledOrders(
    account: AccountSyncCredential,
    orders: ClobOrder[],
  ): Promise<ClobOrder[]> {
    const confirmedOrders: ClobOrder[] = [];

    for (const order of orders) {
      const exchangeOrderId = this._exchangeOrderId(order);
      if (!exchangeOrderId) {
        confirmedOrders.push(order);
        continue;
      }

      const cachedOrder = await this._accountRepository.getCachedOrderByExchangeOrderId(
        account.id,
        exchangeOrderId,
      );
      if (!this._shouldConfirmSnapshotCanceledOrder(cachedOrder, order)) {
        confirmedOrders.push(order);
        continue;
      }

      try {
        const confirmedOrder = await this._client.getOrder(account.id, exchangeOrderId);
        if (confirmedOrder) confirmedOrders.push(confirmedOrder);
      } catch (reason) {
        this._onWarning(
          `Failed to confirm canceled account order: ${account.name} / ${exchangeOrderId}`,
          reason,
        );
      }
    }

    return confirmedOrders;
  }

  private async confirmMissingOpenOrders(
    account: AccountSyncCredential,
    seenExchangeOrderIds: string[],
  ): Promise<void> {
    const candidates = await this._accountRepository.listActiveWalletOrdersMissingFromSnapshot(
      account.id,
      seenExchangeOrderIds,
    );

    for (const order of candidates) {
      const exchangeOrderId = this._exchangeOrderId(order);
      if (!exchangeOrderId) continue;

      try {
        const confirmedOrder = await this._client.getOrder(account.id, exchangeOrderId);
        if (confirmedOrder) {
          await this._accountRepository.upsertWalletOrders(account.id, [confirmedOrder]);
        } else {
          await this._accountRepository.markAccountOrderInactiveByExchangeOrderId(
            account.id,
            exchangeOrderId,
          );
        }
      } catch (reason) {
        this._onWarning(
          `Failed to confirm account order: ${account.name} / ${exchangeOrderId}`,
          reason,
        );
      }
    }
  }

  private async _openOrdersFingerprint(walletId: string): Promise<string> {
    const orders = await this._accountRepository.listCachedOpenOrders(walletId);
    const normalized = orders
      .map((order) => this._normalizeOrderForFingerprint(order))
      .sort((left, right) => left.id.localeCompare(right.id));
    return this._stableStringify(normalized);
  }

  private _normalizeOrderForFingerprint(order: ClobOrder): { id: string; raw: ClobOrder } {
    return {
      id: this._orderId(order),
      raw: order,
    };
  }

  private _orderId(order: ClobOrder): string {
    return this._exchangeOrderId(order);
  }

  private _exchangeOrderIds(orders: ClobOrder[]): string[] {
    return orders.map((order) => this._exchangeOrderId(order)).filter(Boolean);
  }

  private _exchangeOrderId(order: ClobOrder): string {
    const record = order as unknown as Record<string, unknown>;
    return String(
      order.exchange_order_id ||
        order.id ||
        record.orderID ||
        record.orderId ||
        record.order_id ||
        record.orderHash ||
        record.hash ||
        '',
    );
  }

  private _shouldConfirmSnapshotCanceledOrder(
    cachedOrder: {
      active: boolean;
      status: AccountOrderStatus;
    } | null,
    snapshotOrder: ClobOrder,
  ): boolean {
    if (!cachedOrder) return false;
    if (cachedOrder.status !== 'canceled' || cachedOrder.active) return false;
    return this._isActiveStatus(this._orderStatus(snapshotOrder));
  }

  private _orderStatus(order: ClobOrder): AccountOrderStatus {
    const record = order as unknown as Record<string, unknown>;
    const rawStatus = String(record.status || '').toLowerCase();
    if (this._isAccountOrderStatus(rawStatus)) return rawStatus;
    return 'live';
  }

  private _isAccountOrderStatus(value: string): value is AccountOrderStatus {
    return [
      'pending',
      'submitting',
      'submitted',
      'live',
      'matched',
      'delayed',
      'unmatched',
      'submit-failed',
      'failed',
      'rejected',
      'canceled',
    ].includes(value);
  }

  private _isActiveStatus(status: AccountOrderStatus): boolean {
    return [
      'pending',
      'submitting',
      'submitted',
      'live',
      'delayed',
      'unmatched',
      'submit-failed',
    ].includes(status);
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

export { TradingAccountOrderSyncService };
export type { TradingAccountOrderSyncServiceOptions };
