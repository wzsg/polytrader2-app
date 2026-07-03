import type { TradingMarketEvent } from '@polytrader/shared';
import type { TradingMarketRuntime, TradingMarketSubscription } from './types.js';

interface TradingMarketSubscriptionImplOptions {
  id: string;
  market: TradingMarketRuntime;
  onUnsubscribe: (subscription: TradingMarketSubscriptionImpl) => void;
}

class TradingMarketSubscriptionImpl implements TradingMarketSubscription {
  private readonly _id: string;
  private readonly _market: TradingMarketRuntime;
  private readonly _onUnsubscribe: (subscription: TradingMarketSubscriptionImpl) => void;
  private readonly _eventUnsubscribers = new Set<() => void>();
  private _closed = false;

  public constructor(options: TradingMarketSubscriptionImplOptions) {
    this._id = options.id;
    this._market = options.market;
    this._onUnsubscribe = options.onUnsubscribe;
  }

  public get id(): string {
    return this._id;
  }

  public get marketId(): string {
    return this._market.marketId;
  }

  public get market(): TradingMarketRuntime {
    return this._market;
  }

  public get closed(): boolean {
    return this._closed;
  }

  public onEvent(callback: (event: TradingMarketEvent) => void): () => void {
    if (this._closed) return () => undefined;
    const unsubscribe = this._market.onEvent(callback);
    const wrappedUnsubscribe = (): void => {
      unsubscribe();
      this._eventUnsubscribers.delete(wrappedUnsubscribe);
    };
    this._eventUnsubscribers.add(wrappedUnsubscribe);
    return wrappedUnsubscribe;
  }

  public unsubscribe(): void {
    if (this._closed) return;
    this._closed = true;
    for (const unsubscribe of [...this._eventUnsubscribers]) unsubscribe();
    this._eventUnsubscribers.clear();
    this._onUnsubscribe(this);
  }
}

export { TradingMarketSubscriptionImpl };
export type { TradingMarketSubscriptionImplOptions };
