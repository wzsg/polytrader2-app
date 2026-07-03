import { EventEmitter } from 'events';
import type {
  MarketTradeRepository,
  MarketTradeRepositoryCreator,
} from '@polytrader/repository-contract';
import type { MarketTradeSyncStatus } from '@polytrader/shared';
import type { MarketTradeStreamEvent, MarketTradeSyncClient } from './types.js';

const RECONNECT_DELAY_MS = 5_000;

interface MarketTradeSyncServiceOptions {
  repositoryFactory: MarketTradeRepositoryCreator;
  client: MarketTradeSyncClient;
  reconnectDelayMs?: number;
}

interface MarketTradeSyncTask {
  marketId: string;
  conditionId: string;
  repository: MarketTradeRepository;
  status: MarketTradeSyncStatus;
  controller: AbortController | null;
  streamPromise: Promise<void> | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
}

type MarketTradeSyncEventMap = {
  status: [status: MarketTradeSyncStatus];
};

class MarketTradeSyncService extends EventEmitter<MarketTradeSyncEventMap> {
  private readonly _repositoryFactory: MarketTradeRepositoryCreator;
  private readonly _client: MarketTradeSyncClient;
  private readonly _reconnectDelayMs: number;
  private readonly _tasks = new Map<string, MarketTradeSyncTask>();

  public constructor(options: MarketTradeSyncServiceOptions) {
    super();
    this._repositoryFactory = options.repositoryFactory;
    this._client = options.client;
    this._reconnectDelayMs = options.reconnectDelayMs ?? RECONNECT_DELAY_MS;
  }

  public start(marketId: string, conditionId: string): MarketTradeSyncStatus {
    const normalizedMarketId = this.normalizeRequired(
      marketId,
      'marketId is required to sync market trades',
    );
    const normalizedConditionId = this.normalizeRequired(
      conditionId,
      'conditionId is required to sync market trades',
    );
    const taskKey = this.taskKey(normalizedMarketId, normalizedConditionId);

    const existing = this._tasks.get(taskKey);
    if (existing) {
      this.ensureStream(existing);
      return existing.status;
    }

    const task = this.createTask(normalizedMarketId, normalizedConditionId);
    this._tasks.set(taskKey, task);
    this.ensureStream(task);
    return task.status;
  }

  public async status(marketId: string, conditionId: string): Promise<MarketTradeSyncStatus> {
    const normalizedMarketId = this.normalizeRequired(
      marketId,
      'marketId is required to query sync status',
    );
    const normalizedConditionId = this.normalizeRequired(
      conditionId,
      'conditionId is required to query sync status',
    );
    const task = this._tasks.get(this.taskKey(normalizedMarketId, normalizedConditionId));
    if (task) return task.status;
    const repository = this._repositoryFactory(normalizedMarketId, normalizedConditionId);
    return {
      marketId: normalizedMarketId,
      conditionId: normalizedConditionId,
      state: 'idle',
      totalCached: await repository.countMarketTrades().catch(() => 0),
      backfilled: false,
      lastSyncedAt: null,
    };
  }

  public stopAll(): void {
    for (const task of this._tasks.values()) {
      this.stopTask(task);
    }
    this._tasks.clear();
  }

  private createTask(marketId: string, conditionId: string): MarketTradeSyncTask {
    return {
      marketId,
      conditionId,
      repository: this._repositoryFactory(marketId, conditionId),
      status: {
        marketId,
        conditionId,
        state: 'idle',
        totalCached: 0,
        backfilled: false,
        lastSyncedAt: null,
      },
      controller: null,
      streamPromise: null,
      reconnectTimer: null,
    };
  }

  private ensureStream(task: MarketTradeSyncTask): void {
    if (task.streamPromise) return;
    if (task.reconnectTimer) {
      clearTimeout(task.reconnectTimer);
      task.reconnectTimer = null;
    }

    const controller = new AbortController();
    task.controller = controller;
    task.streamPromise = this.runStream(task, controller).finally(() => {
      if (task.controller === controller) task.controller = null;
      task.streamPromise = null;
      if (!controller.signal.aborted && this.isActiveTask(task)) {
        this.scheduleReconnect(task);
      }
    });
  }

  private async runStream(task: MarketTradeSyncTask, controller: AbortController): Promise<void> {
    this.updateStatus(task, { state: 'syncing', error: undefined });

    try {
      for await (const event of this._client.streamMarketTrades(
        task.conditionId,
        {
          backfill: !task.status.backfilled,
          follow: true,
        },
        controller.signal,
      )) {
        if (controller.signal.aborted) break;
        await this.handleStreamEvent(task, event);
      }
    } catch (err) {
      if (controller.signal.aborted || this.isAbortError(err)) return;
      this.updateStatus(task, {
        state: 'error',
        error: this.errorMessage(err),
      });
    }
  }

  private async handleStreamEvent(
    task: MarketTradeSyncTask,
    event: MarketTradeStreamEvent,
  ): Promise<void> {
    if (event.conditionId !== task.conditionId) return;

    if (event.type === 'page') {
      await this.handlePage(task, event);
    } else if (event.type === 'backfill-done') {
      await this.handleBackfillDone(task);
    } else if (event.type === 'heartbeat') {
      this.handleHeartbeat(task);
    } else if (event.type === 'done') {
      await this.handleDone(task);
    }
  }

  private async handlePage(
    task: MarketTradeSyncTask,
    event: Extract<MarketTradeStreamEvent, { type: 'page' }>,
  ): Promise<void> {
    if (event.trades.length) {
      await task.repository.upsertMarketTrades(event.trades);
    }

    await this.refreshCount(task);
    this.updateStatus(task, {
      state: task.status.backfilled ? 'ready' : 'syncing',
      lastSyncedAt: new Date().toISOString(),
      error: undefined,
    });
  }

  private async handleBackfillDone(task: MarketTradeSyncTask): Promise<void> {
    task.status.backfilled = true;
    await this.refreshCount(task);
    this.updateStatus(task, {
      state: 'ready',
      lastSyncedAt: new Date().toISOString(),
      error: undefined,
    });
  }

  private handleHeartbeat(task: MarketTradeSyncTask): void {
    this.updateStatus(task, {
      state: task.status.backfilled ? 'ready' : 'syncing',
      lastSyncedAt: new Date().toISOString(),
      error: undefined,
    });
  }

  private async handleDone(task: MarketTradeSyncTask): Promise<void> {
    await this.refreshCount(task);
    this.updateStatus(task, {
      state: task.status.backfilled ? 'ready' : 'syncing',
      lastSyncedAt: new Date().toISOString(),
      error: undefined,
    });
  }

  private stopTask(task: MarketTradeSyncTask): void {
    if (task.reconnectTimer) {
      clearTimeout(task.reconnectTimer);
      task.reconnectTimer = null;
    }
    if (task.controller && !task.controller.signal.aborted) {
      task.controller.abort();
    }
    task.controller = null;
    task.streamPromise = null;
  }

  private scheduleReconnect(task: MarketTradeSyncTask): void {
    if (task.reconnectTimer || task.streamPromise || !this.isActiveTask(task)) return;
    task.reconnectTimer = setTimeout(() => {
      task.reconnectTimer = null;
      if (this.isActiveTask(task)) {
        this.ensureStream(task);
      }
    }, this._reconnectDelayMs);
  }

  private async refreshCount(task: MarketTradeSyncTask): Promise<void> {
    task.status.totalCached = await task.repository
      .countMarketTrades()
      .catch(() => task.status.totalCached);
  }

  private updateStatus(task: MarketTradeSyncTask, patch: Partial<MarketTradeSyncStatus>): void {
    task.status = {
      ...task.status,
      ...patch,
      marketId: task.marketId,
      conditionId: task.conditionId,
    };
    this.emit('status', task.status);
  }

  private isActiveTask(task: MarketTradeSyncTask): boolean {
    return this._tasks.get(this.taskKey(task.marketId, task.conditionId)) === task;
  }

  private isAbortError(err: unknown): boolean {
    return err instanceof Error && err.name === 'AbortError';
  }

  private errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  private normalizeRequired(value: string, message: string): string {
    const normalized = String(value || '').trim();
    if (!normalized) throw new Error(message);
    return normalized;
  }

  private taskKey(marketId: string, conditionId: string): string {
    return `${marketId}\u0000${conditionId}`;
  }
}

export { MarketTradeSyncService };
export type { MarketTradeSyncEventMap, MarketTradeSyncServiceOptions };
