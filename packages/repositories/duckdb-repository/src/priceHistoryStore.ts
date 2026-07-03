import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import type {
  MarketPriceHistoryFidelity,
  MarketPriceHistoryQuery,
  MarketPriceHistoryRepository,
  MarketPriceHistorySyncState,
  MarketPriceHistorySyncStateInput,
  MarketPriceHistoryUpsertInput,
} from '@polytrader/repository-contract';
import type { PriceHistoryPoint } from '@polytrader/shared';

interface MarketPriceHistoryHandle {
  instance: DuckDBInstance;
  connection: DuckDBConnection;
}

interface PriceHistoryTickConfig {
  fidelity: MarketPriceHistoryFidelity;
  label: string;
  tableName: string;
}

const PRICE_HISTORY_DIR = 'market-price-history';
const PRICE_HISTORY_TICKS: PriceHistoryTickConfig[] = [
  { fidelity: 1, label: '1m', tableName: 'price_history_1m' },
  { fidelity: 5, label: '5m', tableName: 'price_history_5m' },
  { fidelity: 15, label: '15m', tableName: 'price_history_15m' },
  { fidelity: 30, label: '30m', tableName: 'price_history_30m' },
  { fidelity: 60, label: '1h', tableName: 'price_history_1h' },
  { fidelity: 240, label: '4h', tableName: 'price_history_4h' },
  { fidelity: 1440, label: '1d', tableName: 'price_history_1d' },
  { fidelity: 10080, label: '1w', tableName: 'price_history_1w' },
];
const PRICE_HISTORY_INTERVAL_MS: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
  '1m': 30 * 24 * 60 * 60 * 1000,
};

class DuckDbMarketPriceHistoryStore implements MarketPriceHistoryRepository {
  private readonly _marketId: string;
  private readonly _conditionId: string | null;
  private readonly _dbPath: string;
  private _handle: Promise<MarketPriceHistoryHandle> | null = null;
  private _queue: Promise<void> = Promise.resolve();

  public constructor(marketId: string, conditionId: string | null, dbPath: string) {
    this._marketId = marketId;
    this._conditionId = conditionId;
    this._dbPath = dbPath;
  }

  public async listPriceHistory(
    query: MarketPriceHistoryQuery,
  ): Promise<Record<string, PriceHistoryPoint[]>> {
    const tableName = this.tableNameForFidelity(query.fidelity);
    const tokenIds = this.normalizeTokenIds(query.tokenIds);
    if (!tokenIds.length) return {};

    return this.runQueued(async (connection) => {
      const timeFrom = this.intervalTimeFrom(query.interval);
      const tokenFilter = this.tokenFilter(tokenIds);
      const clauses = ['market_id = $marketId', `token_id IN (${tokenFilter.placeholders})`];
      const values: Record<string, string | number> = {
        marketId: this._marketId,
        ...tokenFilter.values,
      };

      if (timeFrom != null) {
        clauses.push('t >= $timeFrom');
        values.timeFrom = timeFrom;
      }

      const reader = await connection.runAndReadAll(
        `
          SELECT token_id, t, p
          FROM ${tableName}
          WHERE ${clauses.join(' AND ')}
          ORDER BY token_id ASC, t ASC
        `,
        values,
      );
      const result: Record<string, PriceHistoryPoint[]> = Object.fromEntries(
        tokenIds.map((tokenId) => [tokenId, []]),
      );
      for (const row of reader.getRowObjectsJS() as Array<Record<string, unknown>>) {
        const tokenId = String(row.token_id || '');
        const t = Number(row.t);
        const p = Number(row.p);
        if (!tokenId || !Number.isFinite(t) || !Number.isFinite(p)) continue;
        result[tokenId]?.push({ t, p });
      }
      return result;
    });
  }

  public async upsertPriceHistory(input: MarketPriceHistoryUpsertInput): Promise<number> {
    const tableName = this.tableNameForFidelity(input.fidelity);
    const tokenId = this.normalizeRequired(input.tokenId, 'tokenId is required');
    const points = this.normalizePoints(input.points);
    if (!points.length) return 0;

    return this.runQueued(async (connection) => {
      const sql = `
        INSERT INTO ${tableName} (
          market_id,
          condition_id,
          token_id,
          outcome,
          t,
          p,
          source_interval,
          fetched_at,
          updated_at
        )
        VALUES (
          $marketId,
          $conditionId,
          $tokenId,
          $outcome,
          $t,
          $p,
          $sourceInterval,
          $fetchedAt,
          $updatedAt
        )
        ON CONFLICT(token_id, t) DO UPDATE SET
          market_id = excluded.market_id,
          condition_id = excluded.condition_id,
          outcome = excluded.outcome,
          p = excluded.p,
          source_interval = excluded.source_interval,
          fetched_at = excluded.fetched_at,
          updated_at = excluded.updated_at
      `;
      const updatedAt = new Date().toISOString();
      await connection.run('BEGIN TRANSACTION');
      try {
        for (const point of points) {
          await connection.run(sql, {
            marketId: this._marketId,
            conditionId: input.conditionId ?? this._conditionId,
            tokenId,
            outcome: input.outcome ?? null,
            t: point.t,
            p: point.p,
            sourceInterval: this.normalizeInterval(input.interval),
            fetchedAt: input.fetchedAt,
            updatedAt,
          });
        }
        await connection.run('COMMIT');
      } catch (err) {
        await connection.run('ROLLBACK').catch(() => undefined);
        throw err;
      }
      return points.length;
    });
  }

  public async getSyncState(
    query: MarketPriceHistoryQuery,
  ): Promise<MarketPriceHistorySyncState[]> {
    const tokenIds = this.normalizeTokenIds(query.tokenIds);
    if (!tokenIds.length) return [];
    const fidelity = this.normalizeFidelity(query.fidelity);
    const interval = this.normalizeInterval(query.interval);

    return this.runQueued(async (connection) => {
      const tokenFilter = this.tokenFilter(tokenIds);
      const reader = await connection.runAndReadAll(
        `
          SELECT
            market_id,
            condition_id,
            token_id,
            source_interval,
            fidelity,
            last_fetched_at,
            point_count,
            error
          FROM price_history_sync_state
          WHERE market_id = $marketId
            AND token_id IN (${tokenFilter.placeholders})
            AND source_interval = $sourceInterval
            AND fidelity = $fidelity
        `,
        {
          marketId: this._marketId,
          ...tokenFilter.values,
          sourceInterval: interval,
          fidelity,
        },
      );
      const byToken = new Map<string, MarketPriceHistorySyncState>();
      for (const row of reader.getRowObjectsJS() as Array<Record<string, unknown>>) {
        const state = this.rowToSyncState(row);
        byToken.set(state.tokenId, state);
      }
      return tokenIds.map(
        (tokenId) =>
          byToken.get(tokenId) ?? {
            marketId: this._marketId,
            conditionId: this._conditionId,
            tokenId,
            interval,
            fidelity,
            lastFetchedAt: null,
            pointCount: 0,
            error: null,
          },
      );
    });
  }

  public async markSyncState(input: MarketPriceHistorySyncStateInput): Promise<void> {
    const tokenId = this.normalizeRequired(input.tokenId, 'tokenId is required');
    const fidelity = this.normalizeFidelity(input.fidelity);
    const interval = this.normalizeInterval(input.interval);

    await this.runQueued(async (connection) => {
      await connection.run(
        `
          INSERT INTO price_history_sync_state (
            market_id,
            condition_id,
            token_id,
            source_interval,
            fidelity,
            last_fetched_at,
            point_count,
            error,
            updated_at
          )
          VALUES (
            $marketId,
            $conditionId,
            $tokenId,
            $sourceInterval,
            $fidelity,
            $lastFetchedAt,
            $pointCount,
            $error,
            $updatedAt
          )
          ON CONFLICT(market_id, token_id, source_interval, fidelity) DO UPDATE SET
            condition_id = excluded.condition_id,
            last_fetched_at = excluded.last_fetched_at,
            point_count = excluded.point_count,
            error = excluded.error,
            updated_at = excluded.updated_at
        `,
        {
          marketId: this._marketId,
          conditionId: input.conditionId ?? this._conditionId,
          tokenId,
          sourceInterval: interval,
          fidelity,
          lastFetchedAt: input.fetchedAt,
          pointCount: Math.max(0, Math.trunc(Number(input.pointCount) || 0)),
          error: input.error ?? null,
          updatedAt: new Date().toISOString(),
        },
      );
    });
  }

  public async close(): Promise<void> {
    const handle = this._handle;
    this._handle = null;
    await this._queue.catch(() => undefined);
    if (!handle) return;

    const resolved = await Promise.allSettled([handle]);
    for (const item of resolved) {
      if (item.status === 'fulfilled') item.value.connection.closeSync();
    }
  }

  private async initSchema(connection: DuckDBConnection): Promise<void> {
    for (const tick of PRICE_HISTORY_TICKS) {
      await connection.run(`
        CREATE TABLE IF NOT EXISTS ${tick.tableName} (
          market_id VARCHAR NOT NULL,
          condition_id VARCHAR,
          token_id VARCHAR NOT NULL,
          outcome VARCHAR,
          t DOUBLE NOT NULL,
          p DOUBLE NOT NULL,
          source_interval VARCHAR NOT NULL,
          fetched_at TIMESTAMP NOT NULL,
          updated_at TIMESTAMP DEFAULT current_timestamp,
          PRIMARY KEY (token_id, t)
        )
      `);
      await connection.run(`DROP INDEX IF EXISTS idx_${tick.tableName}_token_t`);
      await connection.run(
        `CREATE INDEX IF NOT EXISTS idx_${tick.tableName}_market_token_t ON ${tick.tableName} (market_id, token_id, t)`,
      );
    }

    await connection.run(`
      CREATE TABLE IF NOT EXISTS price_history_sync_state (
        market_id VARCHAR NOT NULL,
        condition_id VARCHAR,
        token_id VARCHAR NOT NULL,
        source_interval VARCHAR NOT NULL,
        fidelity INTEGER NOT NULL,
        last_fetched_at TIMESTAMP,
        point_count INTEGER NOT NULL DEFAULT 0,
        error VARCHAR,
        updated_at TIMESTAMP DEFAULT current_timestamp,
        PRIMARY KEY (market_id, token_id, source_interval, fidelity)
      )
    `);
    await connection.run(
      'CREATE INDEX IF NOT EXISTS idx_price_history_sync_state_token ON price_history_sync_state (market_id, token_id, source_interval, fidelity)',
    );
  }

  private async createHandle(): Promise<MarketPriceHistoryHandle> {
    const instance = await DuckDBInstance.create(this._dbPath);
    const connection = await instance.connect();
    await this.initSchema(connection);
    return { instance, connection };
  }

  private async getHandle(): Promise<MarketPriceHistoryHandle> {
    let handle = this._handle;
    if (!handle) {
      handle = this.createHandle();
      this._handle = handle;
    }
    return handle;
  }

  private async runQueued<T>(operation: (connection: DuckDBConnection) => Promise<T>): Promise<T> {
    const handle = await this.getHandle();
    const run = this._queue
      .then(() => operation(handle.connection))
      .catch((error) => {
        if (this.isFatalDatabaseError(error)) {
          this._handle = null;
          try {
            handle.connection.closeSync();
          } catch {
            // The connection may already be invalidated by DuckDB.
          }
        }
        throw error;
      });
    this._queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private isFatalDatabaseError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return (
      message.includes('database has been invalidated') || message.includes('previous fatal error')
    );
  }

  private rowToSyncState(row: Record<string, unknown>): MarketPriceHistorySyncState {
    return {
      marketId: String(row.market_id || this._marketId),
      conditionId: row.condition_id == null ? null : String(row.condition_id),
      tokenId: String(row.token_id || ''),
      interval: String(row.source_interval || '1d'),
      fidelity: this.normalizeFidelity(row.fidelity),
      lastFetchedAt: row.last_fetched_at == null ? null : String(row.last_fetched_at),
      pointCount: Math.max(0, Math.trunc(Number(row.point_count) || 0)),
      error: row.error == null || row.error === '' ? null : String(row.error),
    };
  }

  private normalizePoints(points: PriceHistoryPoint[]): PriceHistoryPoint[] {
    return points
      .map((point) => ({ t: Number(point.t), p: Number(point.p) }))
      .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.p))
      .sort((a, b) => a.t - b.t);
  }

  private intervalTimeFrom(interval: string): number | null {
    const normalized = this.normalizeInterval(interval);
    const duration = PRICE_HISTORY_INTERVAL_MS[normalized];
    if (!duration) return null;
    return Date.now() - duration;
  }

  private tableNameForFidelity(value: unknown): string {
    const fidelity = this.normalizeFidelity(value);
    return PRICE_HISTORY_TICKS.find((tick) => tick.fidelity === fidelity)?.tableName ?? '';
  }

  private normalizeFidelity(value: unknown): MarketPriceHistoryFidelity {
    const numeric = Math.max(1, Math.trunc(Number(value) || 5));
    let best = PRICE_HISTORY_TICKS[0];
    for (const tick of PRICE_HISTORY_TICKS) {
      if (Math.abs(tick.fidelity - numeric) < Math.abs(best.fidelity - numeric)) best = tick;
    }
    return best.fidelity;
  }

  private normalizeInterval(interval: string): string {
    return ['max', 'all', '1m', '1w', '1d', '6h', '1h'].includes(interval) ? interval : '1d';
  }

  private normalizeTokenIds(tokenIds: string[]): string[] {
    return [...new Set(tokenIds.map((id) => String(id || '').trim()).filter(Boolean))];
  }

  private tokenFilter(tokenIds: string[]): {
    placeholders: string;
    values: Record<string, string>;
  } {
    const values: Record<string, string> = {};
    const placeholders = tokenIds
      .map((tokenId, index) => {
        const key = `tokenId${index}`;
        values[key] = tokenId;
        return `$${key}`;
      })
      .join(', ');
    return { placeholders, values };
  }

  private normalizeRequired(value: string, message: string): string {
    const normalized = String(value || '').trim();
    if (!normalized) throw new Error(message);
    return normalized;
  }
}

class MarketPriceHistoryRepositoryFactory {
  private static _instance: MarketPriceHistoryRepositoryFactory | null = null;

  private _baseDir = '';
  private readonly _repositories = new Map<string, DuckDbMarketPriceHistoryStore>();

  private constructor() {}

  public static getInstance(): MarketPriceHistoryRepositoryFactory {
    if (!this._instance) this._instance = new MarketPriceHistoryRepositoryFactory();
    return this._instance;
  }

  public setMarketPriceHistoryStoragePath(userDataPath: string): void {
    const normalized = String(userDataPath || '').trim();
    if (!normalized)
      throw new Error('userDataPath is required to initialize the price history DuckDB path');

    const nextBaseDir = path.join(normalized, PRICE_HISTORY_DIR);
    if (this._baseDir && this._baseDir !== nextBaseDir && this._repositories.size) {
      throw new Error(
        'The price history DuckDB is already open, so the storage path cannot be changed',
      );
    }

    this._baseDir = nextBaseDir;
    fs.mkdirSync(this._baseDir, { recursive: true });
  }

  public createMarketPriceHistoryRepository(
    marketId: string,
    conditionId?: string | null,
  ): MarketPriceHistoryRepository {
    const normalizedMarketId = this.normalizeRequired(
      marketId,
      'marketId is required to access the price history DuckDB',
    );
    const normalizedConditionId = this.normalizeOptional(conditionId);
    const key = this.repositoryKey(normalizedMarketId, normalizedConditionId);
    const cached = this._repositories.get(key);
    if (cached) return cached;

    const repository = new DuckDbMarketPriceHistoryStore(
      normalizedMarketId,
      normalizedConditionId,
      this.resolveDbPath(normalizedMarketId, normalizedConditionId),
    );
    this._repositories.set(key, repository);
    return repository;
  }

  public async closeMarketPriceHistoryRepository(): Promise<void> {
    const repositories = [...this._repositories.values()];
    this._repositories.clear();
    await Promise.allSettled(repositories.map((repository) => repository.close()));
  }

  private assertStoragePath(): string {
    if (!this._baseDir) throw new Error('Market price history storage path not configured');
    return this._baseDir;
  }

  private normalizeRequired(value: string, message: string): string {
    const normalized = String(value || '').trim();
    if (!normalized) throw new Error(message);
    return normalized;
  }

  private normalizeOptional(value?: string | null): string | null {
    const normalized = String(value || '').trim();
    return normalized || null;
  }

  private repositoryKey(marketId: string, conditionId: string | null): string {
    return `${marketId}\u0000${conditionId ?? ''}`;
  }

  private hashValue(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private safeFileName(input: string): string {
    const normalized = input.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    return `${normalized || 'market'}-${this.hashValue(input).slice(0, 12)}.duckdb`;
  }

  private resolveDbPath(marketId: string, conditionId: string | null): string {
    const baseDir = this.assertStoragePath();
    return path.join(baseDir, this.safeFileName(`${marketId}-${conditionId ?? ''}`));
  }
}

export { MarketPriceHistoryRepositoryFactory };
