import { and, desc, eq, ne } from 'drizzle-orm';
import type { StrategyBotRecord } from '@polytrader/repository-contract';
import type {
  StrategyBotCreateInput,
  StrategyBotDetail,
  StrategyBotListItem,
  StrategyBotListParams,
  StrategyBotStatus,
  StrategyBotUpdateInput,
  StrategyRunDetail,
} from '@polytrader/shared';
import { getDb } from '../client.js';
import {
  events,
  markets,
  strategies,
  strategyBots,
  strategyRuns,
  polymarketWallets,
} from '../schema/index.js';
import { SqliteStrategyRunRepository } from './strategyRunRepository.js';

type StrategyBotRow = typeof strategyBots.$inferSelect;

class SqliteStrategyBotRepository {
  private readonly _runRepository = new SqliteStrategyRunRepository();

  public markUnfinishedBotsInterrupted(updatedAt: string): void {
    for (const status of ['starting', 'running', 'stopping'] as const) {
      getDb()
        .update(strategyBots)
        .set({
          status: 'error',
          activeRunId: null,
          runtimeError: 'The app restarted, so the bot run was interrupted',
          updatedAt,
        })
        .where(and(eq(strategyBots.status, status)))
        .run();
    }
  }

  public list(params: StrategyBotListParams = {}): StrategyBotListItem[] {
    const filters = [];
    if (params.marketId) filters.push(eq(strategyBots.marketId, params.marketId));
    if (params.eventId) filters.push(eq(strategyBots.eventId, params.eventId));
    if (params.strategyId) filters.push(eq(strategyBots.strategyId, params.strategyId));
    if (params.walletId) filters.push(eq(strategyBots.walletId, params.walletId));
    if (params.status) filters.push(eq(strategyBots.status, params.status));
    if (params.autoStart !== undefined) filters.push(eq(strategyBots.autoStart, params.autoStart));
    if (params.enabled !== undefined) filters.push(eq(strategyBots.enabled, params.enabled));
    const base = getDb().select().from(strategyBots);
    const query = filters.length ? base.where(and(...filters)) : base;
    return query
      .orderBy(desc(strategyBots.updatedAt))
      .limit(Math.max(1, Math.min(params.limit || 200, 1_000)))
      .all()
      .map((row) => this._mapBot(row));
  }

  public create(input: StrategyBotCreateInput, id: string, createdAt: string): StrategyBotDetail {
    const strategy = this._runRepository.getStrategy(input.strategyId);
    const version = this._runRepository.resolveStrategyVersion(strategy, input.strategyVersion);
    const account = this._runRepository.getAccount(input.walletId);
    const name = this._normalizeText(input.name);
    const market = this._resolveMarketByConditionId(input.conditionId);
    const marketId = market.id;
    const eventId = market.eventId;
    const assetId = this._requireAssetId(input.assetId);
    const config = this._normalizeText(input.config) || '{}';
    this._parseConfig(config);
    if (!name) throw new Error('Bot name is required');
    this._assertAssetBelongsToMarket(market, assetId);
    this._assertNameAvailable(name);

    try {
      getDb()
        .insert(strategyBots)
        .values({
          id,
          name,
          marketId,
          eventId,
          conditionId: market.conditionId,
          assetId,
          strategyId: strategy.id,
          strategyVersion: 'version' in version ? version.version : strategy.currentVersion,
          walletId: account.id,
          config,
          autoStart: this._toBool(input.autoStart, false),
          enabled: true,
          status: 'idle',
          activeRunId: null,
          runtimeError: null,
          createdAt,
          updatedAt: createdAt,
        })
        .run();
    } catch (error) {
      if (this._isUniqueNameError(error)) {
        throw new Error(`Bot name already exists: ${name}`, { cause: error });
      }
      throw error;
    }
    return this.get(id);
  }

  public update(input: StrategyBotUpdateInput, updatedAt: string): StrategyBotDetail {
    const existing = this.getRecord(input.id);
    if (['starting', 'running', 'stopping'].includes(existing.status)) {
      throw new Error('Running bots cannot be edited. Stop the bot first');
    }
    const next: Partial<typeof strategyBots.$inferInsert> = {
      updatedAt,
    };

    if (input.name !== undefined) {
      const name = this._normalizeText(input.name);
      if (!name) throw new Error('Bot name is required');
      this._assertNameAvailable(name, input.id);
      next.name = name;
    }
    if (input.assetId !== undefined) {
      const market = this._resolveMarketById(existing.marketId);
      const assetId = this._requireAssetId(input.assetId);
      this._assertAssetBelongsToMarket(market, assetId);
      next.assetId = assetId;
    }
    if (input.strategyId !== undefined || input.strategyVersion !== undefined) {
      const strategy = this._runRepository.getStrategy(input.strategyId || existing.strategyId);
      const version = this._runRepository.resolveStrategyVersion(strategy, input.strategyVersion);
      next.strategyId = strategy.id;
      next.strategyVersion = 'version' in version ? version.version : strategy.currentVersion;
    }
    if (input.walletId !== undefined) {
      next.walletId = this._runRepository.getAccount(input.walletId).id;
    }
    if (input.config !== undefined) {
      const config = this._normalizeText(input.config) || '{}';
      this._parseConfig(config);
      next.config = config;
    }
    if (input.autoStart !== undefined) next.autoStart = Boolean(input.autoStart);
    if (input.enabled !== undefined) next.enabled = Boolean(input.enabled);

    try {
      getDb().update(strategyBots).set(next).where(eq(strategyBots.id, input.id)).run();
    } catch (error) {
      if (this._isUniqueNameError(error) && next.name) {
        throw new Error(`Bot name already exists: ${next.name}`, { cause: error });
      }
      throw error;
    }
    return this.get(input.id);
  }

  public updateRuntimeStatus(
    id: string,
    status: StrategyBotStatus,
    activeRunId: string | null,
    runtimeError: string | null,
    updatedAt: string,
  ): StrategyBotDetail {
    getDb()
      .update(strategyBots)
      .set({ status, activeRunId, runtimeError, updatedAt })
      .where(eq(strategyBots.id, id))
      .run();
    return this.get(id);
  }

  public delete(id: string): void {
    this.getRecord(id);
    getDb().delete(strategyBots).where(eq(strategyBots.id, id)).run();
  }

  public get(id: string): StrategyBotDetail {
    return this._mapBot(this._getRow(id));
  }

  public getRecord(id: string): StrategyBotRecord {
    return this._mapRecord(this._getRow(id));
  }

  public getActiveRun(botId: string): StrategyRunDetail | null {
    const bot = this.getRecord(botId);
    if (!bot.activeRunId) return null;
    try {
      return this._runRepository.getRun(bot.activeRunId);
    } catch {
      return null;
    }
  }

  private _getRow(id: string): StrategyBotRow {
    const row = getDb().select().from(strategyBots).where(eq(strategyBots.id, id)).get() || null;
    if (!row) throw new Error(`Bot does not exist: ${id}`);
    return row;
  }

  private _assertNameAvailable(name: string, excludingId?: string): void {
    const filters = [eq(strategyBots.name, name)];
    if (excludingId) filters.push(ne(strategyBots.id, excludingId));
    const existing =
      getDb()
        .select({ id: strategyBots.id })
        .from(strategyBots)
        .where(and(...filters))
        .limit(1)
        .get() || null;
    if (existing) throw new Error(`Bot name already exists: ${name}`);
  }

  private _mapBot(row: StrategyBotRow): StrategyBotListItem {
    const strategy =
      getDb().select().from(strategies).where(eq(strategies.id, row.strategyId)).get() || null;
    const account =
      getDb()
        .select()
        .from(polymarketWallets)
        .where(eq(polymarketWallets.id, row.walletId))
        .get() || null;
    const event =
      getDb().select().from(events).where(eq(events.id, row.eventId)).limit(1).get() || null;
    const market =
      getDb().select().from(markets).where(eq(markets.id, row.marketId)).limit(1).get() || null;
    const marketTitle = this._marketTitle(market) || row.marketId;
    const lastRunRow =
      getDb()
        .select()
        .from(strategyRuns)
        .where(eq(strategyRuns.botId, row.id))
        .orderBy(desc(strategyRuns.startedAt))
        .limit(1)
        .get() || null;
    const lastRun = lastRunRow ? this._runRepository.getRun(lastRunRow.id) : null;
    return {
      id: row.id,
      name: row.name,
      marketId: row.marketId,
      eventId: row.eventId,
      conditionId: row.conditionId,
      marketTitle,
      eventTitle: event?.title || marketTitle,
      eventImage: event?.image || '',
      eventActive: event?.active ?? null,
      eventClosed: event?.closed ?? null,
      eventEndDate: event?.endDate || null,
      marketIcon: market?.icon || market?.image || '',
      assetId: row.assetId,
      strategyId: row.strategyId,
      strategyName: strategy?.name || row.strategyId,
      strategyVersion: row.strategyVersion,
      walletId: row.walletId,
      walletName: account?.name || row.walletId,
      config: row.config,
      autoStart: row.autoStart,
      enabled: row.enabled,
      status: row.status as StrategyBotStatus,
      activeRunId: row.activeRunId,
      runtimeError: row.runtimeError,
      lastRun,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private _mapRecord(row: StrategyBotRow): StrategyBotRecord {
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
      status: row.status as StrategyBotStatus,
      activeRunId: row.activeRunId,
      runtimeError: row.runtimeError,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private _normalizeText(value: unknown): string {
    return String(value ?? '').trim();
  }

  private _requireAssetId(value: unknown): string {
    const assetId = this._normalizeText(value);
    if (!assetId) throw new Error('assetId is required');
    return assetId;
  }

  private _resolveMarketByConditionId(conditionId: unknown): typeof markets.$inferSelect {
    const normalized = this._normalizeText(conditionId);
    if (!normalized) throw new Error('conditionId is required');
    const row =
      getDb().select().from(markets).where(eq(markets.conditionId, normalized)).limit(1).get() ||
      null;
    if (!row) throw new Error(`Market does not exist for conditionId: ${normalized}`);
    return row;
  }

  private _resolveMarketById(marketId: unknown): typeof markets.$inferSelect {
    const normalized = this._normalizeText(marketId);
    if (!normalized) throw new Error('marketId is required');
    const row =
      getDb().select().from(markets).where(eq(markets.id, normalized)).limit(1).get() || null;
    if (!row) throw new Error(`Market does not exist: ${normalized}`);
    return row;
  }

  private _assertAssetBelongsToMarket(market: typeof markets.$inferSelect, assetId: string): void {
    if (this._marketAssetIds(market).has(assetId)) return;
    const conditionId = market.conditionId || market.id;
    throw new Error(`assetId does not belong to the bot market: ${assetId} / ${conditionId}`);
  }

  private _marketAssetIds(market: typeof markets.$inferSelect): Set<string> {
    const ids = new Set<string>();
    for (const tokenId of this._parseJsonArray<unknown>(market.clobTokenIds)) {
      this._addAssetId(ids, tokenId);
    }
    this._addAssetId(ids, market.clobTokenIds0);
    this._addAssetId(ids, market.clobTokenIds1);
    return ids;
  }

  private _addAssetId(ids: Set<string>, value: unknown): void {
    const normalized = this._normalizeText(value);
    if (normalized) ids.add(normalized);
  }

  private _parseJsonArray<T>(value: unknown): T[] {
    if (Array.isArray(value)) return value as T[];
    if (typeof value !== 'string') return [];
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }

  private _marketTitle(market: typeof markets.$inferSelect | null): string {
    if (!market) return '';
    return market.groupItemTitle || market.question || market.slug || market.id;
  }

  private _toBool(value: unknown, fallback: boolean): boolean {
    return value === undefined ? fallback : Boolean(value);
  }

  private _parseConfig(value: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(value || '{}') as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Strategy config must be a JSON object');
      }
      return parsed as Record<string, unknown>;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Strategy config JSON is invalid: ${message}`, { cause: err });
    }
  }

  private _isUniqueNameError(error: unknown): boolean {
    return error instanceof Error && error.message.includes('strategy_bots.name');
  }
}

export { SqliteStrategyBotRepository };
