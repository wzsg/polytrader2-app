import { randomUUID } from 'crypto';
import type {
  TradingMarketSubscribeOptions,
  TradingMarketSnapshot,
  TradingWindowInput,
} from '@polytrader/shared';
import { TradingMarketSubscriptionImpl } from './tradingMarketSubscription.js';
import { TradingMarketRuntimeImpl } from './tradingMarketRuntime.js';
import type {
  TradingMarketRuntime,
  TradingMarketService,
  TradingMarketServiceOptions,
  TradingMarketSubscribeResult,
} from './types.js';

interface MarketRuntimeRecord {
  runtime: TradingMarketRuntimeImpl;
  subscriptions: Map<string, TradingMarketSubscriptionImpl>;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
}

class TradingMarketServiceImpl implements TradingMarketService {
  private readonly _records = new Map<string, MarketRuntimeRecord>();
  private readonly _options: TradingMarketServiceOptions;
  private readonly _cleanupDelayMs: number;
  private readonly _unsubscribeMarketTradeSync: () => void;

  public constructor(options: TradingMarketServiceOptions) {
    this._options = options;
    this._cleanupDelayMs = options.cleanupDelayMs ?? 10_000;
    this._unsubscribeMarketTradeSync = this._options.marketTradeSync.onStatus((status) => {
      if (!status.marketId) return;
      const record = this._records.get(status.marketId);
      if (!record) return;
      record.runtime.handleMarketTradeSyncStatus(status);
    });
  }

  public async subscribe(
    input: TradingWindowInput,
    options: TradingMarketSubscribeOptions = {},
  ): Promise<TradingMarketSubscribeResult> {
    const marketId = input.marketId?.trim();
    if (!marketId) throw new Error('marketId is required');
    const record = this._getOrCreateRecord(marketId);
    this._cancelCleanup(record);
    const subscription = this._createSubscription(record);
    record.subscriptions.set(subscription.id, subscription);
    try {
      const snapshot = await record.runtime.initialize({ ...input, marketId }, options);
      return { subscription, snapshot };
    } catch (error) {
      subscription.unsubscribe();
      throw error;
    }
  }

  public getMarket(marketId: string): TradingMarketRuntime | null {
    return this._records.get(marketId)?.runtime ?? null;
  }

  public getSnapshot(marketId: string): TradingMarketSnapshot | null {
    return this.getMarket(marketId)?.snapshot() ?? null;
  }

  public disposeMarket(marketId: string): void {
    const record = this._records.get(marketId);
    if (!record) return;
    this._records.delete(marketId);
    this._cancelCleanup(record);
    for (const subscription of [...record.subscriptions.values()]) {
      subscription.unsubscribe();
    }
    record.subscriptions.clear();
    record.runtime.dispose();
  }

  public disposeAll(): void {
    for (const marketId of [...this._records.keys()]) this.disposeMarket(marketId);
  }

  public dispose(): void {
    this.disposeAll();
    this._unsubscribeMarketTradeSync();
  }

  private _getOrCreateRecord(marketId: string): MarketRuntimeRecord {
    const existing = this._records.get(marketId);
    if (existing) return existing;
    const runtime = new TradingMarketRuntimeImpl({
      marketId,
      ...this._options,
    });
    const record: MarketRuntimeRecord = {
      runtime,
      subscriptions: new Map(),
      cleanupTimer: null,
    };
    this._records.set(marketId, record);
    return record;
  }

  private _createSubscription(record: MarketRuntimeRecord): TradingMarketSubscriptionImpl {
    return new TradingMarketSubscriptionImpl({
      id: randomUUID(),
      market: record.runtime,
      onUnsubscribe: (subscription) => this._handleSubscriptionUnsubscribe(subscription),
    });
  }

  private _handleSubscriptionUnsubscribe(subscription: TradingMarketSubscriptionImpl): void {
    const record = this._records.get(subscription.marketId);
    if (!record) return;
    record.subscriptions.delete(subscription.id);
    if (record.subscriptions.size === 0) this._scheduleCleanup(record);
  }

  private _scheduleCleanup(record: MarketRuntimeRecord): void {
    if (record.cleanupTimer) return;
    record.cleanupTimer = setTimeout(() => {
      record.cleanupTimer = null;
      if (record.subscriptions.size > 0) return;
      this.disposeMarket(record.runtime.marketId);
    }, this._cleanupDelayMs);
  }

  private _cancelCleanup(record: MarketRuntimeRecord): void {
    if (!record.cleanupTimer) return;
    clearTimeout(record.cleanupTimer);
    record.cleanupTimer = null;
  }
}

export { TradingMarketServiceImpl };
