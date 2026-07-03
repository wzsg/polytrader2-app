import type {
  ClobOrder,
  ClobTrade,
  DataPosition,
  TradingAccountDataQuery,
  TradingAccountPositionMergeInput,
  TradingAccountPositionOperationResult,
  TradingAccountPositionRedeemInput,
  TradingAccountPositionSplitInput,
  TradingRuntimeAccountState,
} from '@polytrader/shared';
import type {
  TradingAccountOrderCancelAllInput,
  TradingAccountOrderCancelManyInput,
  TradingAccountOrderCancelInput,
  TradingAccountOrderDeleteFailedInput,
  TradingAccountOrderManualPlaceInput,
  TradingAccountOrderStrategyPlaceInput,
  TradingAccountOrderTradingEventMap,
} from './order/index.js';
import type { TradingAccountSyncEventMap } from './sync/index.js';

type TradingAccountEventMap = TradingAccountOrderTradingEventMap & TradingAccountSyncEventMap;

type UnionToIntersection<T> = (T extends unknown ? (value: T) => void : never) extends (
  value: infer Intersection,
) => void
  ? Intersection
  : never;

type TypedEventEmitter<EventMap extends { [EventName in keyof EventMap]: unknown[] }> =
  UnionToIntersection<
    {
      [EventName in keyof EventMap & string]: {
        on(
          eventName: EventName,
          listener: (...args: EventMap[EventName]) => void,
        ): TypedEventEmitter<EventMap>;
        off(
          eventName: EventName,
          listener: (...args: EventMap[EventName]) => void,
        ): TypedEventEmitter<EventMap>;
      };
    }[keyof EventMap & string]
  >;

interface TradingAccountOrderService extends TypedEventEmitter<TradingAccountOrderTradingEventMap> {
  placeManualOrder(input: TradingAccountOrderManualPlaceInput): Promise<unknown>;
  placeStrategyOrder(input: TradingAccountOrderStrategyPlaceInput): Promise<unknown>;
  cancelOrder(input: TradingAccountOrderCancelInput): Promise<unknown>;
  cancelOrders(input: TradingAccountOrderCancelManyInput): Promise<unknown>;
  cancelAllOrders(input: TradingAccountOrderCancelAllInput): Promise<unknown>;
  deleteFailedOrder(input: TradingAccountOrderDeleteFailedInput): Promise<void>;
}

interface TradingAccountPositionService {
  splitPosition(
    input: TradingAccountPositionSplitInput,
  ): Promise<TradingAccountPositionOperationResult>;
  mergePositions(
    input: TradingAccountPositionMergeInput,
  ): Promise<TradingAccountPositionOperationResult>;
  redeemPositions(
    input: TradingAccountPositionRedeemInput,
  ): Promise<TradingAccountPositionOperationResult>;
}

interface TradingAccountSyncService extends TypedEventEmitter<TradingAccountSyncEventMap> {
  start(): void;
  stop(): void;
  syncAccountNow(walletId: string): Promise<void>;
  scheduleAccountSync(walletId: string): void;
}

interface TradingAccountQueryService {
  queryOrders(query?: TradingAccountDataQuery): Promise<ClobOrder[]>;
  queryPositions(query?: TradingAccountDataQuery): Promise<DataPosition[]>;
  queryTrades(query?: TradingAccountDataQuery): Promise<ClobTrade[]>;
  queryAccount(
    query?: TradingAccountDataQuery & {
      fallbackAccountId?: string;
    },
  ): Promise<TradingRuntimeAccountState>;
}

interface TradingAccountService extends TypedEventEmitter<TradingAccountEventMap> {
  queryOrders(query?: TradingAccountDataQuery): Promise<ClobOrder[]>;
  queryPositions(query?: TradingAccountDataQuery): Promise<DataPosition[]>;
  queryTrades(query?: TradingAccountDataQuery): Promise<ClobTrade[]>;
  queryAccount(
    query?: TradingAccountDataQuery & {
      fallbackAccountId?: string;
    },
  ): Promise<TradingRuntimeAccountState>;
  placeManualOrder(input: TradingAccountOrderManualPlaceInput): Promise<unknown>;
  placeStrategyOrder(input: TradingAccountOrderStrategyPlaceInput): Promise<unknown>;
  cancelOrder(input: TradingAccountOrderCancelInput): Promise<unknown>;
  cancelOrders(input: TradingAccountOrderCancelManyInput): Promise<unknown>;
  cancelAllOrders(input: TradingAccountOrderCancelAllInput): Promise<unknown>;
  deleteFailedOrder(input: TradingAccountOrderDeleteFailedInput): Promise<void>;
  splitPosition(
    input: TradingAccountPositionSplitInput,
  ): Promise<TradingAccountPositionOperationResult>;
  mergePositions(
    input: TradingAccountPositionMergeInput,
  ): Promise<TradingAccountPositionOperationResult>;
  redeemPositions(
    input: TradingAccountPositionRedeemInput,
  ): Promise<TradingAccountPositionOperationResult>;
  start(): void;
  stop(): void;
  syncAccountNow(walletId: string): Promise<void>;
  scheduleAccountSync(walletId: string): void;
}

export type {
  TradingAccountEventMap,
  TradingAccountOrderService,
  TradingAccountPositionService,
  TradingAccountQueryService,
  TradingAccountService,
  TradingAccountSyncService,
};
