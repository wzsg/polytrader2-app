import { randomUUID } from 'crypto';
import { createSqliteStrategyBotRepository } from '@polytrader/sqlite-repository';
import type {
  StrategyBotRecord,
  StrategyBotRepository as StrategyBotRepositoryContract,
} from '@polytrader/repository-contract';
import type {
  StrategyBotCreateInput,
  StrategyBotDetail,
  StrategyBotListItem,
  StrategyBotListParams,
  StrategyBotStatus,
  StrategyBotUpdateInput,
  StrategyRunDetail,
} from '@polytrader/shared';
import { now } from '../utils/time.js';

type StrategyBotRow = StrategyBotRecord;

class StrategyBotRepository {
  private readonly _repository: StrategyBotRepositoryContract;

  public constructor(
    repository: StrategyBotRepositoryContract = createSqliteStrategyBotRepository(),
  ) {
    this._repository = repository;
  }

  public async markUnfinishedBotsInterrupted(): Promise<void> {
    await this._repository.markUnfinishedBotsInterrupted(now());
  }

  public list(params: StrategyBotListParams = {}): Promise<StrategyBotListItem[]> {
    return this._repository.list(params);
  }

  public create(input: StrategyBotCreateInput): Promise<StrategyBotDetail> {
    return this._repository.create(input, randomUUID(), now());
  }

  public update(input: StrategyBotUpdateInput): Promise<StrategyBotDetail> {
    return this._repository.update(input, now());
  }

  public updateRuntimeStatus(
    id: string,
    status: StrategyBotStatus,
    activeRunId: string | null,
    runtimeError: string | null,
  ): Promise<StrategyBotDetail> {
    return this._repository.updateRuntimeStatus(id, status, activeRunId, runtimeError, now());
  }

  public async delete(id: string): Promise<void> {
    await this._repository.delete(id);
  }

  public get(id: string): Promise<StrategyBotDetail> {
    return this._repository.get(id);
  }

  public getRow(id: string): Promise<StrategyBotRow> {
    return this._repository.getRecord(id);
  }

  public getActiveRun(botId: string): Promise<StrategyRunDetail | null> {
    return this._repository.getActiveRun(botId);
  }
}

export { StrategyBotRepository };
export type { StrategyBotRow };
