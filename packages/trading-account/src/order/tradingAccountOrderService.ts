import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import type {
  AccountDataRepository,
  StrategyRunOrderInsertInput,
  StrategyRunRepository,
} from '@polytrader/repository-contract';
import type {
  AccountOrderStatus,
  ManualPlaceOrderInput,
  StrategyPlaceOrderInput,
  StrategyRunOrderRecord,
} from '@polytrader/shared';
import { normalizePriceTickSize } from '@polytrader/shared';
import type {
  TradingAccountOrderTradingEvent,
  TradingAccountOrderTradingEventMap,
  TradingAccountOrderTradingEventReason,
} from './tradingAccountOrderEvents.js';
import type { TradingAccountOrderService } from '../types.js';

const MINIMUM_GTD_EXPIRATION_LEAD_SECONDS = 180;

interface TradingAccountOrderCredential {
  id?: string;
  privateKey: string;
  apiKey: string;
  secret: string;
  passphrase: string;
  depositWalletAddress: string;
  signatureType?: number;
  chainId?: number;
  clobHost?: string;
}

interface TradingAccountOrderSession {
  placeOrder(input: StrategyPlaceOrderInput): Promise<unknown>;
  cancelOrder(orderId: string): Promise<unknown>;
  cancelOrders(orderIds: string[]): Promise<unknown>;
  cancelAllOrders(): Promise<unknown>;
}

interface TradingAccountOrderApiClient {
  getPolymarketAccount(credential: TradingAccountOrderCredential): TradingAccountOrderSession;
}

interface TradingAccountOrderCredentialProvider {
  getCredential(walletId: string): Promise<TradingAccountOrderCredential>;
}

interface TradingAccountOrderMarketReference {
  id: string;
  conditionId: string | null;
}

interface TradingAccountOrderMarketResolver {
  getMarketByAssetId(assetId: string): Promise<TradingAccountOrderMarketReference | null>;
}

interface TradingAccountOrderSyncScheduler {
  scheduleAccountSync(walletId: string): void;
}

interface TradingAccountOrderServiceOptions {
  accountDataRepository: AccountDataRepository;
  apiClient: TradingAccountOrderApiClient;
  credentialProvider: TradingAccountOrderCredentialProvider;
  marketResolver: TradingAccountOrderMarketResolver;
  strategyRunRepository: Pick<StrategyRunRepository, 'insertOrder'>;
}

interface TradingAccountOrderServiceImplOptions extends TradingAccountOrderServiceOptions {
  syncScheduler?: TradingAccountOrderSyncScheduler;
}

interface TradingAccountOrderManualPlaceInput extends ManualPlaceOrderInput {
  walletId: string;
}

interface TradingAccountOrderStrategyPlaceInput {
  orderId?: string;
  walletId: string;
  runId: string;
  strategyId: string;
  strategyVersion: number;
  marketId: string;
  order: StrategyPlaceOrderInput;
  onOrderRecord?: (record: StrategyRunOrderRecord) => void;
}

interface TradingAccountOrderCancelInput {
  walletId: string;
  exchangeOrderId: string;
}

interface TradingAccountOrderCancelManyInput {
  walletId: string;
  exchangeOrderIds: string[];
}

interface TradingAccountOrderDeleteFailedInput {
  walletId: string;
  orderId: string;
}

interface TradingAccountOrderCancelAllInput {
  walletId: string;
}

interface TradingAccountOrderLocalPlaceResult {
  orderId: string;
  status: 'submitting';
  submittedAt: string;
}

type TradingAccountOrderResolvedPlaceInput = StrategyPlaceOrderInput & {
  conditionId: string;
};

class TradingAccountOrderServiceImpl
  extends EventEmitter<TradingAccountOrderTradingEventMap>
  implements TradingAccountOrderService
{
  private readonly _accountDataRepository: AccountDataRepository;
  private readonly _apiClient: TradingAccountOrderApiClient;
  private readonly _credentialProvider: TradingAccountOrderCredentialProvider;
  private readonly _marketResolver: TradingAccountOrderMarketResolver;
  private readonly _strategyRunRepository: Pick<StrategyRunRepository, 'insertOrder'>;
  private readonly _syncScheduler: TradingAccountOrderSyncScheduler | null;

  public constructor(options: TradingAccountOrderServiceImplOptions) {
    super();
    this._accountDataRepository = options.accountDataRepository;
    this._apiClient = options.apiClient;
    this._credentialProvider = options.credentialProvider;
    this._marketResolver = options.marketResolver;
    this._strategyRunRepository = options.strategyRunRepository;
    this._syncScheduler = options.syncScheduler ?? null;
  }

  public async placeManualOrder(input: TradingAccountOrderManualPlaceInput): Promise<unknown> {
    const result = await this._placeAccountOrder({
      walletId: input.walletId,
      orderId: this._requireOrderId(input.orderId),
      order: this._normalizeOrder(input.order),
    });
    this._scheduleAccountSync(input.walletId);
    return result;
  }

  public async placeStrategyOrder(input: TradingAccountOrderStrategyPlaceInput): Promise<unknown> {
    const orderId = input.orderId || input.order.idempotencyKey || randomUUID();
    const normalizedOrder = this._normalizeOrder(input.order);
    const conditionId = await this._resolveConditionId(normalizedOrder.assetId);
    const request = this._buildResolvedOrderRequest({ ...normalizedOrder, conditionId });
    const submittedAt = this._now();

    try {
      const response = await this._placeAccountOrder({
        walletId: input.walletId,
        orderId,
        conditionId,
        order: normalizedOrder,
        request,
        submittedAt,
      });
      await this._insertStrategyOrder({
        input,
        orderId,
        conditionId,
        order: normalizedOrder,
        request,
        response,
        success: true,
        errorMessage: null,
        submittedAt,
      });
      this._scheduleAccountSync(input.walletId);
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this._insertStrategyOrder({
        input,
        orderId,
        conditionId,
        order: normalizedOrder,
        request,
        response: null,
        success: false,
        errorMessage: message,
        submittedAt,
      });
      throw error;
    }
  }

  public async cancelOrder(input: TradingAccountOrderCancelInput): Promise<unknown> {
    const exchangeOrderId = input.exchangeOrderId.trim();
    if (!exchangeOrderId) throw new Error('Exchange order ID is required');

    try {
      const credential = await this._credentialProvider.getCredential(input.walletId);
      const response = await this._apiClient
        .getPolymarketAccount(credential)
        .cancelOrder(exchangeOrderId);
      await this._accountDataRepository.updateAccountOrderByExchangeOrderId({
        walletId: input.walletId,
        exchangeOrderId,
        status: 'canceled',
        response,
        completedAt: this._now(),
      });
      this._emitOrderDataChanged({
        walletId: input.walletId,
        reason: 'cancel-success',
        exchangeOrderId,
      });
      this._scheduleAccountSync(input.walletId);
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this._accountDataRepository.updateAccountOrderByExchangeOrderId({
        walletId: input.walletId,
        exchangeOrderId,
        status: 'live',
        errorMessage: message,
        completedAt: this._now(),
      });
      this._emitOrderDataChanged({
        walletId: input.walletId,
        reason: 'cancel-failed',
        exchangeOrderId,
      });
      throw error;
    }
  }

  public async cancelOrders(input: TradingAccountOrderCancelManyInput): Promise<unknown> {
    const exchangeOrderIds = this._normalizeExchangeOrderIds(input.exchangeOrderIds);
    if (!exchangeOrderIds.length) throw new Error('At least one exchange order ID is required');

    try {
      const credential = await this._credentialProvider.getCredential(input.walletId);
      const response = await this._apiClient
        .getPolymarketAccount(credential)
        .cancelOrders(exchangeOrderIds);
      await this._accountDataRepository.updateWalletOrdersByExchangeOrderIds(
        input.walletId,
        exchangeOrderIds,
        {
          status: 'canceled',
          response,
          completedAt: this._now(),
        },
      );
      this._emitOrderDataChanged({
        walletId: input.walletId,
        reason: 'cancel-orders-success',
        exchangeOrderIds,
      });
      this._scheduleAccountSync(input.walletId);
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this._accountDataRepository.updateWalletOrdersByExchangeOrderIds(
        input.walletId,
        exchangeOrderIds,
        {
          status: 'live',
          errorMessage: message,
          completedAt: this._now(),
        },
      );
      this._emitOrderDataChanged({
        walletId: input.walletId,
        reason: 'cancel-orders-failed',
        exchangeOrderIds,
      });
      throw error;
    }
  }

  public async cancelAllOrders(input: TradingAccountOrderCancelAllInput): Promise<unknown> {
    try {
      const credential = await this._credentialProvider.getCredential(input.walletId);
      const response = await this._apiClient.getPolymarketAccount(credential).cancelAllOrders();
      await this._accountDataRepository.updateActiveWalletOrdersByAccount(input.walletId, {
        status: 'canceled',
        response,
        completedAt: this._now(),
      });
      this._emitOrderDataChanged({
        walletId: input.walletId,
        reason: 'cancel-all-success',
      });
      this._scheduleAccountSync(input.walletId);
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this._accountDataRepository.updateActiveWalletOrdersByAccount(input.walletId, {
        status: 'live',
        errorMessage: message,
        completedAt: this._now(),
      });
      this._emitOrderDataChanged({
        walletId: input.walletId,
        reason: 'cancel-all-failed',
      });
      throw error;
    }
  }

  public async deleteFailedOrder(input: TradingAccountOrderDeleteFailedInput): Promise<void> {
    const orderId = this._requireOrderId(input.orderId);
    const deleted = await this._accountDataRepository.deleteFailedAccountOrder(
      input.walletId,
      orderId,
    );
    if (!deleted) throw new Error('No deletable submit-failed order was found');
  }

  private async _placeAccountOrder(input: {
    walletId: string;
    orderId: string;
    conditionId?: string;
    order: StrategyPlaceOrderInput;
    request?: Record<string, unknown>;
    submittedAt?: string;
  }): Promise<TradingAccountOrderLocalPlaceResult> {
    const conditionId = input.conditionId ?? (await this._resolveConditionId(input.order.assetId));
    const request =
      input.request ?? this._buildResolvedOrderRequest({ ...input.order, conditionId });
    const submittedAt = input.submittedAt ?? this._now();
    await this._accountDataRepository.insertAccountOrder({
      walletId: input.walletId,
      orderId: input.orderId,
      conditionId,
      status: 'submitting',
      input: input.order,
      request,
      submittedAt,
    });
    this._emitOrderDataChanged({
      walletId: input.walletId,
      reason: 'place-local',
      orderId: input.orderId,
    });
    void this._submitAccountOrder({
      walletId: input.walletId,
      orderId: input.orderId,
      conditionId,
      order: input.order,
    }).catch((error) => {
      console.warn('Failed to submit account order', error);
    });
    return {
      orderId: input.orderId,
      status: 'submitting',
      submittedAt,
    };
  }

  private async _submitAccountOrder(input: {
    walletId: string;
    orderId: string;
    conditionId: string;
    order: StrategyPlaceOrderInput;
  }): Promise<void> {
    try {
      const credential = await this._credentialProvider.getCredential(input.walletId);
      const response = await this._apiClient
        .getPolymarketAccount(credential)
        .placeOrder(input.order);
      const exchangeOrderId = this._extractOrderId(response);
      const status = this._successStatus(response);
      await this._accountDataRepository.updateAccountOrder({
        walletId: input.walletId,
        orderId: input.orderId,
        status,
        exchangeOrderId,
        response,
        completedAt: this._now(),
      });
      this._emitOrderDataChanged({
        walletId: input.walletId,
        reason: 'place-success',
        orderId: input.orderId,
        exchangeOrderId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this._accountDataRepository.updateAccountOrder({
        walletId: input.walletId,
        orderId: input.orderId,
        status: 'submit-failed',
        response: null,
        errorMessage: message,
        completedAt: this._now(),
      });
      this._emitOrderDataChanged({
        walletId: input.walletId,
        reason: 'place-failed',
        orderId: input.orderId,
      });
    }
  }

  private async _insertStrategyOrder(input: {
    input: TradingAccountOrderStrategyPlaceInput;
    orderId: string;
    conditionId: string;
    order: StrategyPlaceOrderInput;
    request: Record<string, unknown>;
    response: unknown;
    success: boolean;
    errorMessage: string | null;
    submittedAt: string;
  }): Promise<void> {
    const record = await this._strategyRunRepository.insertOrder({
      id: input.orderId,
      runId: input.input.runId,
      walletId: input.input.walletId,
      strategyId: input.input.strategyId,
      strategyVersion: input.input.strategyVersion,
      marketId: input.input.marketId,
      conditionId: input.conditionId,
      input: input.order,
      request: input.request,
      response: input.response,
      success: input.success,
      errorMessage: input.errorMessage,
      submittedAt: input.submittedAt,
    } satisfies StrategyRunOrderInsertInput);
    input.input.onOrderRecord?.(record);
  }

  private _normalizeOrder(input: StrategyPlaceOrderInput): StrategyPlaceOrderInput {
    const assetId = String(input.assetId ?? '').trim();
    if (!assetId) throw new Error('Token ID is required');
    if (input.side !== 'BUY' && input.side !== 'SELL') throw new Error('Order side is invalid');

    if (input.orderType === 'limit') {
      const price = this._assertPositiveNumber(input.price, 'Limit price');
      if (price > 1) throw new Error('Limit price cannot be greater than 1');
      return {
        ...input,
        assetId,
        price,
        shares: this._assertPositiveNumber(input.shares, 'Shares'),
        expiration: this._normalizeLimitOrderExpiration(input.expiration),
      };
    }

    if (input.orderType === 'market') {
      return {
        ...input,
        assetId,
        amount: this._assertPositiveNumber(input.amount, 'Amount'),
        marketOrderType: input.marketOrderType || 'FOK',
      };
    }

    throw new Error('Order type is invalid');
  }

  private _buildResolvedOrderRequest(
    input: TradingAccountOrderResolvedPlaceInput,
  ): Record<string, unknown> {
    if (input.orderType === 'limit') {
      return {
        market: input.conditionId,
        tokenID: input.assetId,
        price: input.price,
        size: input.shares,
        side: input.side,
        orderType: input.expiration == null ? 'GTC' : 'GTD',
        postOnly: input.postOnly === true,
        expiration: input.expiration,
        tickSize: this._normalizeTickSize(input.tickSize),
        negRisk: input.negRisk,
      };
    }

    return {
      market: input.conditionId,
      tokenID: input.assetId,
      amount: input.amount,
      side: input.side,
      orderType: input.marketOrderType || 'FOK',
      tickSize: this._normalizeTickSize(input.tickSize),
      negRisk: input.negRisk,
    };
  }

  private _normalizeTickSize(value: unknown): string | undefined {
    if (value == null) return undefined;
    const normalized = normalizePriceTickSize(value);
    if (normalized != null) return normalized;
    throw new Error(`Unsupported tick size: ${String(value)}`);
  }

  private _normalizeLimitOrderExpiration(value: unknown): number | undefined {
    if (value == null) return undefined;
    const expiration = Number(value);
    if (!Number.isInteger(expiration) || expiration <= 0) {
      throw new Error('Limit order expiration must be a positive Unix timestamp');
    }
    const minimumExpiration = Math.floor(Date.now() / 1000) + MINIMUM_GTD_EXPIRATION_LEAD_SECONDS;
    if (expiration < minimumExpiration) {
      throw new Error('Limit order expiration must be at least 3 minutes in the future');
    }
    return expiration;
  }

  private async _resolveConditionId(assetId: string): Promise<string> {
    const normalizedAssetId = assetId.trim();
    if (!normalizedAssetId) throw new Error('Token ID is required');
    const market = await this._marketResolver.getMarketByAssetId(normalizedAssetId);
    if (!market) throw new Error(`No market was found for token: ${normalizedAssetId}`);
    const conditionId = market.conditionId?.trim();
    if (!conditionId)
      throw new Error(`The token market is missing condition ID: ${normalizedAssetId}`);
    return conditionId;
  }

  private _extractOrderId(response: unknown): string | null {
    if (!response || typeof response !== 'object') return null;
    const record = response as Record<string, unknown>;
    return String(record.orderID || record.orderId || record.order_id || record.id || '') || null;
  }

  private _successStatus(response: unknown): AccountOrderStatus {
    if (!response || typeof response !== 'object') return 'submitted';
    const record = response as Record<string, unknown>;
    const rawStatus = String(record.status || '').toLowerCase();
    if (this._isAccountOrderStatus(rawStatus)) return rawStatus;
    return 'submitted';
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

  private _assertPositiveNumber(value: unknown, label: string): number {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
      throw new Error(`${label} must be a number greater than 0`);
    }
    return num;
  }

  private _requireOrderId(orderId: string): string {
    const normalized = orderId.trim();
    if (!normalized) throw new Error('Local order ID is required');
    return normalized;
  }

  private _normalizeExchangeOrderIds(orderIds: string[]): string[] {
    return [...new Set(orderIds.map((orderId) => orderId.trim()).filter(Boolean))];
  }

  private _now(): string {
    return new Date().toISOString();
  }

  private _scheduleAccountSync(walletId: string): void {
    this._syncScheduler?.scheduleAccountSync(walletId);
  }

  private _emitOrderDataChanged(input: {
    walletId: string;
    reason: TradingAccountOrderTradingEventReason;
    orderId?: string;
    exchangeOrderId?: string | null;
    exchangeOrderIds?: string[];
  }): void {
    const event: TradingAccountOrderTradingEvent = {
      ...input,
      at: this._now(),
    };
    this.emit('order-trading-event', event);
  }
}

export { TradingAccountOrderServiceImpl };
export type {
  TradingAccountOrderApiClient,
  TradingAccountOrderCancelAllInput,
  TradingAccountOrderCancelInput,
  TradingAccountOrderCancelManyInput,
  TradingAccountOrderCredential,
  TradingAccountOrderCredentialProvider,
  TradingAccountOrderDeleteFailedInput,
  TradingAccountOrderManualPlaceInput,
  TradingAccountOrderMarketReference,
  TradingAccountOrderMarketResolver,
  TradingAccountOrderServiceImplOptions,
  TradingAccountOrderServiceOptions,
  TradingAccountOrderSession,
  TradingAccountOrderStrategyPlaceInput,
  TradingAccountOrderSyncScheduler,
};
