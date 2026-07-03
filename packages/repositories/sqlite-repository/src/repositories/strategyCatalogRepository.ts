import { and, desc, eq, isNull } from 'drizzle-orm';
import type {
  StrategyCatalogCreateRecordInput,
  StrategyCatalogUpdateRecordInput,
  StrategyRecord,
  StrategyVersionRecord,
} from '@polytrader/repository-contract';
import type { StrategyListItem, StrategyVersionSummary } from '@polytrader/shared';
import { getDb } from '../client.js';
import { strategies, strategyVersions } from '../schema/index.js';

type StrategyRow = typeof strategies.$inferSelect;
type StrategyVersionRow = typeof strategyVersions.$inferSelect;

class SqliteStrategyCatalogRepository {
  public listStrategies(): StrategyListItem[] {
    return getDb()
      .select()
      .from(strategies)
      .where(isNull(strategies.deletedAt))
      .orderBy(desc(strategies.updatedAt))
      .all()
      .map((row) => this._mapListItem(row));
  }

  public getStrategy(id: string): StrategyRecord | null {
    const row =
      getDb()
        .select()
        .from(strategies)
        .where(and(eq(strategies.id, id), isNull(strategies.deletedAt)))
        .get() || null;
    return row ? this._mapStrategy(row) : null;
  }

  public getStrategyVersion(strategyId: string, version: number): StrategyVersionRecord | null {
    const row =
      getDb()
        .select()
        .from(strategyVersions)
        .where(
          and(eq(strategyVersions.strategyId, strategyId), eq(strategyVersions.version, version)),
        )
        .get() || null;
    return row ? this._mapVersionRecord(row) : null;
  }

  public createStrategy(input: StrategyCatalogCreateRecordInput): StrategyRecord {
    getDb().transaction(() => {
      getDb()
        .insert(strategies)
        .values({
          id: input.id,
          name: input.name,
          currentVersion: 1,
          sourceCode: input.sourceCode,
          compiledCode: input.compiledCode,
          compileStatus: input.compileStatus,
          compileError: input.compileError,
          createdAt: input.createdAt,
          updatedAt: input.createdAt,
        })
        .run();

      getDb()
        .insert(strategyVersions)
        .values({
          id: input.versionId,
          strategyId: input.id,
          version: 1,
          name: input.name,
          sourceCode: input.sourceCode,
          compiledCode: input.compiledCode,
          compileStatus: input.compileStatus,
          compileError: input.compileError,
          createdAt: input.createdAt,
        })
        .run();
    });

    return this._requireStrategy(input.id);
  }

  public updateStrategy(input: StrategyCatalogUpdateRecordInput): StrategyRecord {
    getDb().transaction(() => {
      getDb()
        .update(strategies)
        .set({
          name: input.name,
          sourceCode: input.sourceCode,
          compiledCode: input.compiledCode,
          compileStatus: input.compileStatus,
          compileError: input.compileError,
          currentVersion: input.nextVersion,
          updatedAt: input.updatedAt,
        })
        .where(eq(strategies.id, input.id))
        .run();

      getDb()
        .insert(strategyVersions)
        .values({
          id: input.versionId,
          strategyId: input.id,
          version: input.nextVersion,
          name: input.name,
          sourceCode: input.sourceCode,
          compiledCode: input.compiledCode,
          compileStatus: input.compileStatus,
          compileError: input.compileError,
          createdAt: input.updatedAt,
        })
        .run();
    });

    return this._requireStrategy(input.id);
  }

  public listStrategyVersions(strategyId: string): StrategyVersionSummary[] {
    return getDb()
      .select()
      .from(strategyVersions)
      .where(eq(strategyVersions.strategyId, strategyId))
      .orderBy(desc(strategyVersions.version))
      .all()
      .map((row) => this._mapVersionSummary(row));
  }

  public deleteStrategy(id: string, deletedAt: string): void {
    getDb()
      .update(strategies)
      .set({ deletedAt, updatedAt: deletedAt })
      .where(eq(strategies.id, id))
      .run();
  }

  private _requireStrategy(id: string): StrategyRecord {
    const strategy = this.getStrategy(id);
    if (!strategy) throw new Error(`Strategy does not exist: ${id}`);
    return strategy;
  }

  private _mapListItem(row: StrategyRow): StrategyListItem {
    return {
      id: row.id,
      name: row.name,
      currentVersion: row.currentVersion,
      compileStatus: row.compileStatus as StrategyListItem['compileStatus'],
      compileError: row.compileError,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
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

  private _mapVersionRecord(row: StrategyVersionRow): StrategyVersionRecord {
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

  private _mapVersionSummary(row: StrategyVersionRow): StrategyVersionSummary {
    return {
      id: row.id,
      strategyId: row.strategyId,
      version: row.version,
      name: row.name,
      compileStatus: row.compileStatus as StrategyVersionSummary['compileStatus'],
      compileError: row.compileError,
      createdAt: row.createdAt,
    };
  }
}

export { SqliteStrategyCatalogRepository };
