import { randomUUID } from 'crypto';
import { createSqliteStrategyRunRepository } from '@polytrader/sqlite-repository';
import type {
  StrategyAccountRecord,
  StrategyBotRecord,
  StrategyRecord,
  StrategyRunCreateRecordInput,
  StrategyRunOrderInsertInput,
  StrategyRunRepository as StrategyRunRepositoryContract,
  StrategyVersionRecord,
} from '@polytrader/repository-contract';
import type {
  StrategyLogLevel,
  StrategyRunDetail,
  StrategyRunListItem,
  StrategyRunListParams,
  StrategyRunLogEntry,
  StrategyRunOrderRecord,
  StrategyRunStatus,
} from '@polytrader/shared';
import { serialize } from '../utils/json.js';
import { now } from '../utils/time.js';

type CreateRunRecordInput = StrategyRunCreateRecordInput;
type InsertRunOrderInput = StrategyRunOrderInsertInput;
type StrategyRow = StrategyRecord;
type StrategyVersionRow = StrategyVersionRecord;
type AccountRow = StrategyAccountRecord;
type StrategyBotRow = StrategyBotRecord;

class StrategyRunRepository {
  private readonly _repository: StrategyRunRepositoryContract;

  public constructor(
    repository: StrategyRunRepositoryContract = createSqliteStrategyRunRepository(),
  ) {
    this._repository = repository;
  }

  public async markUnfinishedRunsInterrupted(): Promise<void> {
    await this._repository.markUnfinishedRunsInterrupted(now());
  }

  public createRun(input: CreateRunRecordInput): Promise<StrategyRunDetail> {
    return this._repository.createRun(input);
  }

  public updateRunStatus(
    id: string,
    status: StrategyRunStatus,
    error: string | null,
    stoppedAt?: string | null,
  ): Promise<StrategyRunDetail> {
    return this._repository.updateRunStatus(id, status, error, now(), stoppedAt);
  }

  public getRun(id: string): Promise<StrategyRunDetail> {
    return this._repository.getRun(id);
  }

  public getRunRow(id: string): Promise<StrategyRunDetail> {
    return this._repository.getRun(id);
  }

  public findActiveByMarket(marketId: string): Promise<StrategyRunDetail | null> {
    return this._repository.findActiveByMarket(marketId);
  }

  public listRuns(params: StrategyRunListParams = {}): Promise<StrategyRunListItem[]> {
    return this._repository.listRuns(params);
  }

  public insertLog(
    runId: string,
    level: StrategyLogLevel,
    message: string,
    module = 'strategy',
    data?: unknown,
  ): Promise<StrategyRunLogEntry> {
    const fullMessage = data === undefined ? message : `${message} ${serialize(data)}`;
    return this._repository.insertLog({
      id: randomUUID(),
      runId,
      level,
      module,
      message: fullMessage,
      time: now(),
    });
  }

  public listLogs(runId: string, limit = 200): Promise<StrategyRunLogEntry[]> {
    return this._repository.listLogs(runId, limit);
  }

  public insertOrder(input: InsertRunOrderInput): Promise<StrategyRunOrderRecord> {
    return this._repository.insertOrder(input);
  }

  public listOrders(runId: string, limit = 200): Promise<StrategyRunOrderRecord[]> {
    return this._repository.listOrders(runId, limit);
  }

  public getStrategyRow(id: string): Promise<StrategyRow> {
    return this._repository.getStrategy(id);
  }

  public getStrategy(id: string): Promise<StrategyRow> {
    return this._repository.getStrategy(id);
  }

  public getBotRow(id: string): Promise<StrategyBotRow> {
    return this._repository.getBot(id);
  }

  public getAccountRow(id: string): Promise<AccountRow> {
    return this._repository.getAccount(id);
  }

  public getAccount(id: string): Promise<AccountRow> {
    return this._repository.getAccount(id);
  }

  public resolveStrategyVersion(
    strategy: StrategyRow,
    versionNumber?: number | null,
  ): Promise<StrategyVersionRow | StrategyRow> {
    return this._repository.resolveStrategyVersion(strategy, versionNumber);
  }
}

export { StrategyRunRepository };
export type {
  AccountRow,
  CreateRunRecordInput,
  InsertRunOrderInput,
  StrategyBotRow,
  StrategyRow,
  StrategyRunDetail as StrategyRunRow,
  StrategyVersionRow,
};
