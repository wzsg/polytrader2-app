import { EventEmitter } from 'events';
import type {
  StrategyRunDetail,
  StrategyRunListItem,
  StrategyRunListParams,
  StrategyRunLogEntry,
  StrategyRunOrderRecord,
  StrategyRunRuntimeEvent,
} from '@polytrader/shared';
import { StrategyRunRepository } from './strategyRunRepository.js';

type StrategyRunHistoryEventMap = {
  'runtime-event': [event: StrategyRunRuntimeEvent];
};

class StrategyRunHistoryService extends EventEmitter<StrategyRunHistoryEventMap> {
  private readonly _repository: StrategyRunRepository;

  public constructor(repository = new StrategyRunRepository()) {
    super();
    this._repository = repository;
  }

  public async init(): Promise<void> {
    await this._repository.markUnfinishedRunsInterrupted();
  }

  public stopAll(): void {
    // BotRuntimeService owns live executors. Run history only stores durable records.
  }

  public getActiveByMarket(marketId: string): Promise<StrategyRunDetail | null> {
    return this._repository.findActiveByMarket(marketId);
  }

  public listHistory(params?: StrategyRunListParams): Promise<StrategyRunListItem[]> {
    return this._repository.listRuns(params);
  }

  public getLogs(runId: string, limit?: number): Promise<StrategyRunLogEntry[]> {
    return this._repository.listLogs(runId, limit);
  }

  public getOrders(runId: string, limit?: number): Promise<StrategyRunOrderRecord[]> {
    return this._repository.listOrders(runId, limit);
  }

  public async hasActiveMarket(marketId: string): Promise<boolean> {
    return Boolean(await this.getActiveByMarket(marketId));
  }

  public emitRuntimeEvent(event: StrategyRunRuntimeEvent): void {
    this.emit('runtime-event', event);
  }
}

const strategyRunHistoryService = new StrategyRunHistoryService();

export { StrategyRunHistoryService, strategyRunHistoryService };
