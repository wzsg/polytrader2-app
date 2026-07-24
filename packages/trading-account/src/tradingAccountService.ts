import { EventEmitter } from 'events';
import type {
  ClobOrder,
  ClobTrade,
  DataPosition,
  OrderCancellationResult,
  TradingAccountDataQuery,
  TradingAccountPositionMergeInput,
  TradingAccountPositionOperationResult,
  TradingAccountPositionRedeemInput,
  TradingAccountPositionSplitInput,
  TradingRuntimeAccountState,
} from '@polytrader/shared';
import { TradingAccountOrderServiceImpl } from './order/index.js';
import { TradingAccountQueryServiceImpl } from './query/index.js';
import { TradingAccountSyncServiceImpl } from './sync/index.js';
import type {
  TradingAccountOrderCancelAllInput,
  TradingAccountOrderCancelManyInput,
  TradingAccountOrderCancelInput,
  TradingAccountOrderDeleteFailedInput,
  TradingAccountOrderManualPlaceInput,
  TradingAccountOrderServiceOptions,
  TradingAccountOrderStrategyPlaceInput,
  TradingAccountOrderTradingEvent,
} from './order/index.js';
import { TradingAccountPositionServiceImpl } from './position/index.js';
import type { TradingAccountPositionServiceOptions } from './position/index.js';
import type { TradingAccountQueryServiceOptions } from './query/index.js';
import type {
  TradingAccountBalanceDataChangedEvent,
  TradingAccountOrderSyncEvent,
  TradingAccountPositionDataChangedEvent,
  TradingAccountSyncServiceOptions,
  TradingAccountTradeDataChangedEvent,
} from './sync/index.js';
import type {
  TradingAccountEventMap,
  TradingAccountOrderService,
  TradingAccountPositionService,
  TradingAccountQueryService,
  TradingAccountService,
  TradingAccountSyncService,
} from './types.js';

interface TradingAccountServiceOptions {
  query: TradingAccountQueryServiceOptions;
  sync: TradingAccountSyncServiceOptions;
  order: TradingAccountOrderServiceOptions;
  position: TradingAccountPositionServiceOptions;
}

class TradingAccountServiceImpl
  extends EventEmitter<TradingAccountEventMap>
  implements TradingAccountService
{
  private readonly _queryService: TradingAccountQueryService;
  private readonly _syncService: TradingAccountSyncService;
  private readonly _orderService: TradingAccountOrderService;
  private readonly _positionService: TradingAccountPositionService;

  public constructor(options: TradingAccountServiceOptions) {
    super();
    this._queryService = new TradingAccountQueryServiceImpl(options.query);
    this._syncService = new TradingAccountSyncServiceImpl(options.sync);
    this._orderService = new TradingAccountOrderServiceImpl({
      ...options.order,
      syncScheduler: this._syncService,
    });
    this._positionService = new TradingAccountPositionServiceImpl({
      ...options.position,
      syncScheduler: this._syncService,
    });
    this._wireEvents();
  }

  public queryOrders(query?: TradingAccountDataQuery): Promise<ClobOrder[]> {
    return this._queryService.queryOrders(query);
  }

  public queryPositions(query?: TradingAccountDataQuery): Promise<DataPosition[]> {
    return this._queryService.queryPositions(query);
  }

  public queryTrades(query?: TradingAccountDataQuery): Promise<ClobTrade[]> {
    return this._queryService.queryTrades(query);
  }

  public queryAccount(
    query?: TradingAccountDataQuery & {
      fallbackAccountId?: string;
    },
  ): Promise<TradingRuntimeAccountState> {
    return this._queryService.queryAccount(query);
  }

  public placeManualOrder(input: TradingAccountOrderManualPlaceInput): Promise<unknown> {
    return this._orderService.placeManualOrder(input);
  }

  public placeStrategyOrder(input: TradingAccountOrderStrategyPlaceInput): Promise<unknown> {
    return this._orderService.placeStrategyOrder(input);
  }

  public cancelOrder(input: TradingAccountOrderCancelInput): Promise<OrderCancellationResult> {
    return this._orderService.cancelOrder(input);
  }

  public cancelOrders(input: TradingAccountOrderCancelManyInput): Promise<OrderCancellationResult> {
    return this._orderService.cancelOrders(input);
  }

  public cancelAllOrders(
    input: TradingAccountOrderCancelAllInput,
  ): Promise<OrderCancellationResult> {
    return this._orderService.cancelAllOrders(input);
  }

  public deleteFailedOrder(input: TradingAccountOrderDeleteFailedInput): Promise<void> {
    return this._orderService.deleteFailedOrder(input);
  }

  public splitPosition(
    input: TradingAccountPositionSplitInput,
  ): Promise<TradingAccountPositionOperationResult> {
    return this._positionService.splitPosition(input);
  }

  public mergePositions(
    input: TradingAccountPositionMergeInput,
  ): Promise<TradingAccountPositionOperationResult> {
    return this._positionService.mergePositions(input);
  }

  public redeemPositions(
    input: TradingAccountPositionRedeemInput,
  ): Promise<TradingAccountPositionOperationResult> {
    return this._positionService.redeemPositions(input);
  }

  public start(): void {
    this._syncService.start();
  }

  public stop(): void {
    this._syncService.stop();
  }

  public syncAccountNow(walletId: string): Promise<void> {
    return this._syncService.syncAccountNow(walletId);
  }

  public scheduleAccountSync(walletId: string): void {
    this._syncService.scheduleAccountSync(walletId);
  }

  private _wireEvents(): void {
    this._orderService.on('order-trading-event', (event) => {
      this._emitOrderTradingEvent(event);
    });
    this._syncService.on('balance-sync-event', (event) => {
      this._emitBalanceSyncEvent(event);
    });
    this._syncService.on('order-sync-event', (event) => {
      this._emitOrderSyncEvent(event);
    });
    this._syncService.on('position-sync-event', (event) => {
      this._emitPositionSyncEvent(event);
    });
    this._syncService.on('trade-sync-event', (event) => {
      this._emitTradeSyncEvent(event);
    });
  }

  private _emitOrderTradingEvent(event: TradingAccountOrderTradingEvent): void {
    this.emit('order-trading-event', event);
  }

  private _emitBalanceSyncEvent(event: TradingAccountBalanceDataChangedEvent): void {
    this.emit('balance-sync-event', event);
  }

  private _emitOrderSyncEvent(event: TradingAccountOrderSyncEvent): void {
    this.emit('order-sync-event', event);
  }

  private _emitPositionSyncEvent(event: TradingAccountPositionDataChangedEvent): void {
    this.emit('position-sync-event', event);
  }

  private _emitTradeSyncEvent(event: TradingAccountTradeDataChangedEvent): void {
    this.emit('trade-sync-event', event);
  }
}

export { TradingAccountServiceImpl };
export type { TradingAccountServiceOptions };
