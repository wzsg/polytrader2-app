import { randomUUID } from 'crypto';
import { createSqliteStrategyCatalogRepository } from '@polytrader/sqlite-repository';
import type {
  StrategyCatalogRepository,
  StrategyRecord,
  StrategyVersionRecord,
} from '@polytrader/repository-contract';
import type {
  StrategyCreateInput,
  StrategyDetail,
  StrategyListItem,
  StrategyUpdateInput,
  StrategyVersionSummary,
} from '@polytrader/shared';
import { strategyCompiler, type StrategyCompiler } from './strategyCompiler.js';
import { now } from '../utils/time.js';

type StrategyVersionRow = StrategyVersionRecord;
type StrategyCatalogRow = StrategyRecord;

class StrategyCatalogService {
  private readonly _compiler: StrategyCompiler;
  private readonly _repository: StrategyCatalogRepository;

  public constructor(
    compiler: StrategyCompiler = strategyCompiler,
    repository: StrategyCatalogRepository = createSqliteStrategyCatalogRepository(),
  ) {
    this._compiler = compiler;
    this._repository = repository;
  }

  public listStrategies(): Promise<StrategyListItem[]> {
    return this._repository.listStrategies();
  }

  public async getStrategy(id: string): Promise<StrategyDetail> {
    const row = await this._repository.getStrategy(id);
    if (!row) throw new Error(`Strategy does not exist: ${id}`);
    return this._mapDetail(row);
  }

  public getStrategyVersion(
    strategyId: string,
    version: number,
  ): Promise<StrategyVersionRow | null> {
    return this._repository.getStrategyVersion(strategyId, version);
  }

  public async createStrategy(input: StrategyCreateInput): Promise<StrategyDetail> {
    const name = input.name.trim();
    const sourceCode = input.sourceCode.trim();
    if (!name) throw new Error('Strategy name is required');
    if (!sourceCode) throw new Error('Strategy code is required');

    const compiled = this._compiler.compile(sourceCode);
    const timestamp = now();
    const id = randomUUID();
    const versionId = randomUUID();

    return this._mapDetail(
      await this._repository.createStrategy({
        id,
        versionId,
        name,
        sourceCode,
        compiledCode: compiled.compiledCode,
        compileStatus: compiled.status,
        compileError: compiled.error,
        createdAt: timestamp,
      }),
    );
  }

  public async updateStrategy(input: StrategyUpdateInput): Promise<StrategyDetail> {
    const current = await this.getStrategy(input.id);
    if (
      input.expectedVersion != null &&
      Number(input.expectedVersion) !== Number(current.currentVersion)
    ) {
      throw new Error('Strategy version changed. Refresh before saving');
    }

    const name = input.name?.trim() || current.name;
    const sourceCode = input.sourceCode?.trim() || current.sourceCode;
    if (!name) throw new Error('Strategy name is required');
    if (!sourceCode) throw new Error('Strategy code is required');

    const sourceChanged = sourceCode !== current.sourceCode || name !== current.name;
    if (!sourceChanged) return current;

    const compiled = this._compiler.compile(sourceCode);
    const timestamp = now();
    const nextVersion = current.currentVersion + 1;

    return this._mapDetail(
      await this._repository.updateStrategy({
        id: input.id,
        name,
        sourceCode,
        compiledCode: compiled.compiledCode,
        compileStatus: compiled.status,
        compileError: compiled.error,
        nextVersion,
        versionId: randomUUID(),
        updatedAt: timestamp,
      }),
    );
  }

  public async listStrategyVersions(strategyId: string): Promise<StrategyVersionSummary[]> {
    await this.getStrategy(strategyId);
    return this._repository.listStrategyVersions(strategyId);
  }

  public async deleteStrategy(id: string): Promise<void> {
    await this.getStrategy(id);
    await this._repository.deleteStrategy(id, now());
  }

  private _mapDetail(row: StrategyCatalogRow): StrategyDetail {
    return {
      id: row.id,
      name: row.name,
      currentVersion: row.currentVersion,
      compileStatus: row.compileStatus,
      compileError: row.compileError,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      sourceCode: row.sourceCode,
      compiledCode: row.compiledCode,
    };
  }
}

const strategyCatalogService = new StrategyCatalogService();

export { StrategyCatalogService, strategyCatalogService };
export type { StrategyCatalogRow, StrategyVersionRow };
