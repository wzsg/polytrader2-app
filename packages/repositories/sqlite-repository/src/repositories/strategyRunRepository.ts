import { and, desc, eq, inArray } from 'drizzle-orm';
import type {
  StrategyAccountRecord,
  StrategyBotRecord,
  StrategyRecord,
  StrategyRunCreateRecordInput,
  StrategyRunOrderInsertInput,
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
import { getDb } from '../client.js';
import {
  strategies,
  strategyBots,
  strategyRunLogs,
  strategyRunOrders,
  strategyRuns,
  strategyVersions,
  polymarketWallets,
  markets,
} from '../schema/index.js';

type StrategyRunRow = typeof strategyRuns.$inferSelect;
type StrategyRow = typeof strategies.$inferSelect;
type StrategyVersionRow = typeof strategyVersions.$inferSelect;
type StrategyBotRow = typeof strategyBots.$inferSelect;

class SqliteStrategyRunRepository {
  public markUnfinishedRunsInterrupted(stoppedAt: string): void {
    getDb()
      .update(strategyRuns)
      .set({
        status: 'error',
        runtimeError: 'The app restarted, so the strategy run was interrupted',
        stoppedAt,
        updatedAt: stoppedAt,
      })
      .where(inArray(strategyRuns.status, ['starting', 'running', 'stopping']))
      .run();
  }

  public createRun(input: StrategyRunCreateRecordInput): StrategyRunDetail {
    getDb()
      .insert(strategyRuns)
      .values({
        id: input.id,
        botId: input.botId ?? null,
        marketId: input.marketId,
        eventId: input.eventId,
        conditionId: input.conditionId,
        marketSnapshot: this._serialize(input.marketSnapshot),
        outcomesSnapshot: this._serialize(input.outcomesSnapshot),
        assetId: input.assetId,
        strategyId: input.strategy.id,
        strategyName: input.strategy.name,
        strategyVersion: input.strategyVersion,
        strategySourceCode: input.sourceCode,
        compiledCode: input.compiledCode,
        walletId: input.walletId,
        walletName: input.walletName,
        status: 'starting',
        config: input.config,
        runtimeError: null,
        startedAt: input.startedAt,
        stoppedAt: null,
        createdAt: input.startedAt,
        updatedAt: input.startedAt,
      })
      .run();
    return this.getRun(input.id);
  }

  public updateRunStatus(
    id: string,
    status: StrategyRunStatus,
    error: string | null,
    updatedAt: string,
    stoppedAt?: string | null,
  ): StrategyRunDetail {
    getDb()
      .update(strategyRuns)
      .set({
        status,
        runtimeError: error,
        stoppedAt: stoppedAt === undefined ? this._getRunRow(id).stoppedAt : stoppedAt,
        updatedAt,
      })
      .where(eq(strategyRuns.id, id))
      .run();
    return this.getRun(id);
  }

  public getRun(id: string): StrategyRunDetail {
    return this._mapRunDetail(this._getRunRow(id));
  }

  public findActiveByMarket(marketId: string): StrategyRunDetail | null {
    const row =
      getDb()
        .select()
        .from(strategyRuns)
        .where(
          and(
            eq(strategyRuns.marketId, marketId),
            inArray(strategyRuns.status, ['starting', 'running', 'stopping']),
          ),
        )
        .orderBy(desc(strategyRuns.startedAt))
        .get() || null;
    return row ? this._mapRunDetail(row) : null;
  }

  public listRuns(params: StrategyRunListParams = {}): StrategyRunListItem[] {
    const filters = [];
    if (params.marketId) filters.push(eq(strategyRuns.marketId, params.marketId));
    if (params.eventId) filters.push(eq(strategyRuns.eventId, params.eventId));
    if (params.botId) filters.push(eq(strategyRuns.botId, params.botId));
    if (params.strategyId) filters.push(eq(strategyRuns.strategyId, params.strategyId));
    if (params.walletId) filters.push(eq(strategyRuns.walletId, params.walletId));
    const base = getDb().select().from(strategyRuns);
    const query = filters.length ? base.where(and(...filters)) : base;
    return query
      .orderBy(desc(strategyRuns.startedAt))
      .limit(Math.max(1, Math.min(params.limit || 100, 500)))
      .all()
      .map((row) => this._mapRun(row));
  }

  public insertLog(input: {
    id: string;
    runId: string;
    level: string;
    message: string;
    module: string;
    time: string;
  }): StrategyRunLogEntry {
    this._getRunRow(input.runId);
    getDb()
      .insert(strategyRunLogs)
      .values({
        id: input.id,
        runId: input.runId,
        level: input.level,
        module: input.module,
        message: input.message,
        time: input.time,
      })
      .run();
    return this._mapLog(
      getDb().select().from(strategyRunLogs).where(eq(strategyRunLogs.id, input.id)).get()!,
    );
  }

  public listLogs(runId: string, limit = 200): StrategyRunLogEntry[] {
    this._getRunRow(runId);
    return getDb()
      .select()
      .from(strategyRunLogs)
      .where(eq(strategyRunLogs.runId, runId))
      .orderBy(desc(strategyRunLogs.time))
      .limit(Math.max(1, Math.min(limit, 1_000)))
      .all()
      .map((row) => this._mapLog(row));
  }

  public insertOrder(input: StrategyRunOrderInsertInput): StrategyRunOrderRecord {
    getDb()
      .insert(strategyRunOrders)
      .values({
        id: input.id,
        runId: input.runId,
        walletId: input.walletId,
        strategyId: input.strategyId,
        strategyVersion: input.strategyVersion,
        marketId: input.marketId,
        conditionId: input.conditionId,
        input: this._serialize(input.input),
        request: this._serialize(input.request),
        response: input.response == null ? null : this._serialize(input.response),
        success: input.success,
        exchangeOrderId: this._extractOrderId(input.response),
        status: this._extractStatus(input.response),
        errorMessage: input.errorMessage,
        submittedAt: input.submittedAt,
        createdAt: this._now(),
      })
      .run();
    return this._mapOrder(
      getDb().select().from(strategyRunOrders).where(eq(strategyRunOrders.id, input.id)).get()!,
    );
  }

  public listOrders(runId: string, limit = 200): StrategyRunOrderRecord[] {
    this._getRunRow(runId);
    return getDb()
      .select()
      .from(strategyRunOrders)
      .where(eq(strategyRunOrders.runId, runId))
      .orderBy(desc(strategyRunOrders.submittedAt))
      .limit(Math.max(1, Math.min(limit, 1_000)))
      .all()
      .map((row) => this._mapOrder(row));
  }

  public getStrategy(id: string): StrategyRecord {
    const row = getDb().select().from(strategies).where(eq(strategies.id, id)).get() || null;
    if (!row || row.deletedAt) throw new Error(`Strategy does not exist: ${id}`);
    return this._mapStrategy(row);
  }

  public getBot(id: string): StrategyBotRecord {
    const row = getDb().select().from(strategyBots).where(eq(strategyBots.id, id)).get() || null;
    if (!row) throw new Error(`Bot does not exist: ${id}`);
    return this._mapBotRecord(row);
  }

  public getAccount(id: string): StrategyAccountRecord {
    const row =
      getDb().select().from(polymarketWallets).where(eq(polymarketWallets.id, id)).get() || null;
    if (!row) throw new Error(`Account does not exist: ${id}`);
    return { id: row.id, name: row.name };
  }

  public resolveStrategyVersion(
    strategy: StrategyRecord,
    versionNumber?: number | null,
  ): StrategyVersionRecord | StrategyRecord {
    if (!versionNumber || versionNumber === strategy.currentVersion) return strategy;
    const version = getDb()
      .select()
      .from(strategyVersions)
      .where(
        and(
          eq(strategyVersions.strategyId, strategy.id),
          eq(strategyVersions.version, versionNumber),
        ),
      )
      .get();
    if (!version) throw new Error(`Strategy version does not exist: v${versionNumber}`);
    return this._mapVersion(version);
  }

  private _getRunRow(id: string): StrategyRunRow {
    const row = getDb().select().from(strategyRuns).where(eq(strategyRuns.id, id)).get();
    if (!row) throw new Error(`Strategy run does not exist: ${id}`);
    return row;
  }

  private _mapRun(row: StrategyRunRow): StrategyRunListItem {
    return {
      id: row.id,
      botId: row.botId,
      marketId: row.marketId,
      eventId: row.eventId,
      conditionId: row.conditionId,
      marketTitle: this._marketTitle(row),
      assetId: row.assetId,
      strategyId: row.strategyId,
      strategyName: row.strategyName,
      walletId: row.walletId,
      walletName: row.walletName,
      status: row.status as StrategyRunStatus,
      runtimeError: row.runtimeError,
      strategyVersion: row.strategyVersion,
      config: row.config,
      startedAt: row.startedAt,
      stoppedAt: row.stoppedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private _mapRunDetail(row: StrategyRunRow): StrategyRunDetail {
    return {
      ...this._mapRun(row),
      marketSnapshot: row.marketSnapshot,
      outcomesSnapshot: row.outcomesSnapshot,
    };
  }

  private _mapLog(row: typeof strategyRunLogs.$inferSelect): StrategyRunLogEntry {
    return {
      id: row.id,
      runId: row.runId,
      level: row.level as StrategyLogLevel,
      module: row.module,
      message: row.message,
      time: row.time,
    };
  }

  private _mapOrder(row: typeof strategyRunOrders.$inferSelect): StrategyRunOrderRecord {
    return {
      id: row.id,
      runId: row.runId,
      walletId: row.walletId,
      strategyId: row.strategyId,
      strategyVersion: row.strategyVersion,
      marketId: row.marketId,
      conditionId: row.conditionId,
      input: row.input,
      request: row.request,
      response: row.response,
      success: row.success,
      exchangeOrderId: row.exchangeOrderId,
      status: row.status,
      errorMessage: row.errorMessage,
      submittedAt: row.submittedAt,
      createdAt: row.createdAt,
    };
  }

  private _mapStrategy(row: StrategyRow): StrategyRecord {
    return {
      id: row.id,
      name: row.name,
      currentVersion: row.currentVersion,
      sourceCode: row.sourceCode,
      compiledCode: row.compiledCode,
      compileStatus: row.compileStatus as StrategyRecord['compileStatus'],
      compileError: row.compileError,
      deletedAt: row.deletedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private _mapVersion(row: StrategyVersionRow): StrategyVersionRecord {
    return {
      id: row.id,
      strategyId: row.strategyId,
      version: row.version,
      name: row.name,
      sourceCode: row.sourceCode,
      compiledCode: row.compiledCode,
      compileStatus: row.compileStatus as StrategyVersionRecord['compileStatus'],
      compileError: row.compileError,
      createdAt: row.createdAt,
    };
  }

  private _mapBotRecord(row: StrategyBotRow): StrategyBotRecord {
    return {
      id: row.id,
      name: row.name,
      marketId: row.marketId,
      eventId: row.eventId,
      conditionId: row.conditionId,
      assetId: row.assetId,
      strategyId: row.strategyId,
      strategyVersion: row.strategyVersion,
      walletId: row.walletId,
      config: row.config,
      autoStart: row.autoStart,
      enabled: row.enabled,
      status: row.status as StrategyBotRecord['status'],
      activeRunId: row.activeRunId,
      runtimeError: row.runtimeError,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private _serialize(value: unknown): string {
    return JSON.stringify(value, (_key, item) =>
      typeof item === 'bigint' ? item.toString() : item,
    );
  }

  private _marketTitle(row: StrategyRunRow): string {
    const market =
      getDb().select().from(markets).where(eq(markets.id, row.marketId)).limit(1).get() || null;
    if (!market) return row.conditionId || row.marketId;
    return market.groupItemTitle || market.question || market.slug || market.id;
  }

  private _extractOrderId(response: unknown): string | null {
    if (!response || typeof response !== 'object') return null;
    const record = response as Record<string, unknown>;
    return String(record.orderID || record.orderId || record.order_id || record.id || '') || null;
  }

  private _extractStatus(response: unknown): string | null {
    if (!response || typeof response !== 'object') return null;
    const record = response as Record<string, unknown>;
    return String(record.status || record.errorMsg || record.error || '') || null;
  }

  private _now(): string {
    return new Date().toISOString();
  }
}

export { SqliteStrategyRunRepository };
