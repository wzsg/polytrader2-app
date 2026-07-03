import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import type {
  MarketTradeAnalysisRepositoryQuery,
  MarketTradeRepository,
  MarketTradeRepositoryQuery,
} from '@polytrader/repository-contract';
import type {
  MarketTradeAnalysisBucket,
  MarketTradeAnalysisBreakdown,
  MarketTradeAnalysisPoint,
  MarketTradeAnalysisResult,
  MarketTradeAnalysisSummary,
  MarketTradeListResult,
  MarketTradeSortField,
  MarketTradeSyncStatus,
  MarketTradeTick,
  SortOrder,
} from '@polytrader/shared';

interface MarketTradeHandle {
  instance: DuckDBInstance;
  connection: DuckDBConnection;
}

interface StoredMarketTrade {
  tradeId: string;
  conditionId: string;
  marketId: string;
  tokenId: string;
  outcome: string | null;
  side: string | null;
  price: number | null;
  size: number | null;
  timestamp: number | null;
  transactionHash: string | null;
  source: 'history' | 'live';
  rawJson: string;
}

const TRADE_DIR = 'market-trades';
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
const LARGE_TRADE_LIMIT = 20;

class DuckDbMarketTradeStore implements MarketTradeRepository {
  private readonly _marketId: string;
  private readonly _conditionId: string;
  private readonly _dbPath: string;
  private _handle: Promise<MarketTradeHandle> | null = null;
  private _queue: Promise<void> = Promise.resolve();

  public constructor(marketId: string, conditionId: string, dbPath: string) {
    this._marketId = marketId;
    this._conditionId = conditionId;
    this._dbPath = dbPath;
  }

  private hashValue(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private stableStringify(value: unknown): string {
    if (Array.isArray(value))
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => `${JSON.stringify(key)}:${this.stableStringify(item)}`)
        .join(',')}}`;
    }
    return JSON.stringify(value);
  }

  private normalizeNumber(value: unknown): number | null {
    if (value == null || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  private normalizeTimestamp(value: unknown): number | null {
    const num = this.normalizeNumber(value);
    if (num != null) return num > 1e12 ? num / 1000 : num;
    if (typeof value === 'string') {
      const time = new Date(value).getTime();
      if (Number.isFinite(time)) return time / 1000;
    }
    return null;
  }

  private normalizeString(value: unknown): string | null {
    if (value == null || value === '') return null;
    return String(value);
  }

  private buildTradeId(trade: MarketTradeTick): string {
    if (trade.id) return String(trade.id);
    const parts = [
      trade.transactionHash,
      trade.tokenId,
      trade.timestamp,
      trade.side,
      trade.price,
      trade.size,
    ].filter((part) => part != null && part !== '');
    return parts.length ? parts.map(String).join(':') : this.hashValue(this.stableStringify(trade));
  }

  private toStoredTrade(
    marketId: string,
    conditionId: string,
    trade: MarketTradeTick,
  ): StoredMarketTrade {
    return {
      tradeId: this.buildTradeId(trade),
      conditionId,
      marketId,
      tokenId: String(trade.tokenId || ''),
      outcome: this.normalizeString(trade.outcome),
      side: this.normalizeString(trade.side)?.toUpperCase() ?? null,
      price: this.normalizeNumber(trade.price),
      size: this.normalizeNumber(trade.size),
      timestamp: this.normalizeTimestamp(trade.timestamp),
      transactionHash: this.normalizeString(trade.transactionHash),
      source: trade.source,
      rawJson: JSON.stringify(trade),
    };
  }

  private async initSchema(connection: DuckDBConnection): Promise<void> {
    await connection.run(`
    CREATE TABLE IF NOT EXISTS trades (
      trade_id VARCHAR PRIMARY KEY,
      condition_id VARCHAR NOT NULL,
      market_id VARCHAR NOT NULL,
      token_id VARCHAR NOT NULL,
      outcome VARCHAR,
      side VARCHAR,
      price DOUBLE,
      size DOUBLE,
      "timestamp" DOUBLE,
      transaction_hash VARCHAR,
      source VARCHAR NOT NULL,
      raw_json VARCHAR NOT NULL,
      first_seen_at TIMESTAMP DEFAULT current_timestamp,
      updated_at TIMESTAMP DEFAULT current_timestamp
    )
  `);
    await connection.run('CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades ("timestamp")');
    await connection.run('CREATE INDEX IF NOT EXISTS idx_trades_outcome ON trades (outcome)');
    await connection.run('CREATE INDEX IF NOT EXISTS idx_trades_side ON trades (side)');
    await connection.run('CREATE INDEX IF NOT EXISTS idx_trades_price ON trades (price)');
    await connection.run('CREATE INDEX IF NOT EXISTS idx_trades_size ON trades (size)');
    await connection.run('CREATE INDEX IF NOT EXISTS idx_trades_token ON trades (token_id)');
  }

  private async createHandle(): Promise<MarketTradeHandle> {
    const instance = await DuckDBInstance.create(this._dbPath);
    const connection = await instance.connect();
    await this.initSchema(connection);
    return { instance, connection };
  }

  private async getHandle(): Promise<MarketTradeHandle> {
    let handle = this._handle;
    if (!handle) {
      handle = this.createHandle();
      this._handle = handle;
    }
    return handle;
  }

  private async runQueued<T>(operation: (connection: DuckDBConnection) => Promise<T>): Promise<T> {
    const handle = await this.getHandle();
    const run = this._queue.then(() => operation(handle.connection));
    this._queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private normalizeLimit(value: unknown): number {
    const limit = Math.trunc(Number(value) || DEFAULT_LIMIT);
    return Math.max(1, Math.min(limit, MAX_LIMIT));
  }

  private normalizeOffset(value: unknown): number {
    return Math.max(0, Math.trunc(Number(value) || 0));
  }

  private normalizeSortField(field: unknown): MarketTradeSortField {
    if (field === 'outcome' || field === 'price' || field === 'side' || field === 'size') {
      return field;
    }
    return 'time';
  }

  private normalizeSortOrder(order: unknown): SortOrder {
    return order === 'asc' ? 'asc' : 'desc';
  }

  private numberFilter(value: unknown): number | null {
    return this.normalizeNumber(value);
  }

  private timeFilter(value: unknown): number | null {
    return this.normalizeTimestamp(value);
  }

  private normalizeBucket(bucket: unknown): MarketTradeAnalysisBucket {
    if (bucket === '1m' || bucket === '5m' || bucket === '15m' || bucket === '1h') return bucket;
    return '5m';
  }

  private bucketSeconds(bucket: MarketTradeAnalysisBucket): number {
    switch (bucket) {
      case '1m':
        return 60;
      case '15m':
        return 900;
      case '1h':
        return 3600;
      default:
        return 300;
    }
  }

  private buildAnalysisWhere(query: MarketTradeAnalysisRepositoryQuery): {
    where: string;
    values: Record<string, string | number>;
  } {
    const clauses = ['market_id = $marketId', 'condition_id = $conditionId'];
    const values: Record<string, string | number> = {
      marketId: this._marketId,
      conditionId: this._conditionId,
    };

    if (query.outcome) {
      clauses.push('outcome = $outcome');
      values.outcome = query.outcome;
    }
    if (query.side) {
      clauses.push('side = $side');
      values.side = String(query.side).toUpperCase();
    }

    const timeFrom = this.timeFilter(query.timeFrom);
    const timeTo = this.timeFilter(query.timeTo);
    if (timeFrom != null) {
      clauses.push('"timestamp" >= $timeFrom');
      values.timeFrom = timeFrom;
    }
    if (timeTo != null) {
      clauses.push('"timestamp" <= $timeTo');
      values.timeTo = timeTo;
    }

    return { where: `WHERE ${clauses.join(' AND ')}`, values };
  }

  private buildWhere(query: MarketTradeRepositoryQuery): {
    where: string;
    values: Record<string, string | number>;
  } {
    const clauses = ['market_id = $marketId', 'condition_id = $conditionId'];
    const values: Record<string, string | number> = {
      marketId: this._marketId,
      conditionId: this._conditionId,
    };

    if (query.outcome) {
      clauses.push('outcome = $outcome');
      values.outcome = query.outcome;
    }
    if (query.side) {
      clauses.push('side = $side');
      values.side = String(query.side).toUpperCase();
    }

    const priceMin = this.numberFilter(query.priceMin);
    const priceMax = this.numberFilter(query.priceMax);
    const sizeMin = this.numberFilter(query.sizeMin);
    const sizeMax = this.numberFilter(query.sizeMax);
    const timeFrom = this.timeFilter(query.timeFrom);
    const timeTo = this.timeFilter(query.timeTo);

    if (priceMin != null) {
      clauses.push('price >= $priceMin');
      values.priceMin = priceMin;
    }
    if (priceMax != null) {
      clauses.push('price <= $priceMax');
      values.priceMax = priceMax;
    }
    if (sizeMin != null) {
      clauses.push('size >= $sizeMin');
      values.sizeMin = sizeMin;
    }
    if (sizeMax != null) {
      clauses.push('size <= $sizeMax');
      values.sizeMax = sizeMax;
    }
    if (timeFrom != null) {
      clauses.push('"timestamp" >= $timeFrom');
      values.timeFrom = timeFrom;
    }
    if (timeTo != null) {
      clauses.push('"timestamp" <= $timeTo');
      values.timeTo = timeTo;
    }

    return { where: `WHERE ${clauses.join(' AND ')}`, values };
  }

  private sortColumn(field: MarketTradeSortField): string {
    switch (field) {
      case 'outcome':
        return 'outcome';
      case 'price':
        return 'price';
      case 'side':
        return 'side';
      case 'size':
        return 'size';
      default:
        return '"timestamp"';
    }
  }

  private rowToTrade(row: Record<string, unknown>): MarketTradeTick {
    return {
      id: String(row.trade_id || ''),
      tokenId: String(row.token_id || ''),
      outcome: this.normalizeString(row.outcome) ?? undefined,
      side: this.normalizeString(row.side) ?? undefined,
      price: row.price == null ? undefined : Number(row.price),
      priceRaw: row.price == null ? undefined : Number(row.price),
      size: row.size == null ? undefined : Number(row.size),
      timestamp: row.timestamp == null ? undefined : Number(row.timestamp),
      transactionHash: this.normalizeString(row.transaction_hash) ?? undefined,
      source: row.source === 'live' ? 'live' : 'history',
    };
  }

  private asNumber(value: unknown): number {
    return Number(value ?? 0) || 0;
  }

  private asNullableNumber(value: unknown): number | null {
    if (value == null) return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  private imbalanceRatio(buySize: number, sellSize: number): number | null {
    const total = buySize + sellSize;
    if (total <= 0) return null;
    return (buySize - sellSize) / total;
  }

  private rowToSummary(row: Record<string, unknown> | undefined): MarketTradeAnalysisSummary {
    const buySize = this.asNumber(row?.buy_size);
    const sellSize = this.asNumber(row?.sell_size);
    const imbalance = buySize - sellSize;
    return {
      totalTrades: this.asNumber(row?.total_trades),
      totalSize: this.asNumber(row?.total_size),
      notional: this.asNumber(row?.notional),
      vwap: this.asNullableNumber(row?.vwap),
      latestPrice: this.asNullableNumber(row?.latest_price),
      highPrice: this.asNullableNumber(row?.high_price),
      lowPrice: this.asNullableNumber(row?.low_price),
      buySize,
      sellSize,
      imbalance,
      imbalanceRatio: this.imbalanceRatio(buySize, sellSize),
    };
  }

  private rowToBreakdown(row: Record<string, unknown>): MarketTradeAnalysisBreakdown {
    const buySize = this.asNumber(row.buy_size);
    const sellSize = this.asNumber(row.sell_size);
    const imbalance = buySize - sellSize;
    return {
      key: String(row.key || '—'),
      trades: this.asNumber(row.trades),
      size: this.asNumber(row.size),
      notional: this.asNumber(row.notional),
      vwap: this.asNullableNumber(row.vwap),
      buySize,
      sellSize,
      imbalance,
      imbalanceRatio: this.imbalanceRatio(buySize, sellSize),
    };
  }

  private rowToPoint(row: Record<string, unknown>): MarketTradeAnalysisPoint {
    const buySize = this.asNumber(row.buy_size);
    const sellSize = this.asNumber(row.sell_size);
    const imbalance = buySize - sellSize;
    return {
      bucketStart: this.asNumber(row.bucket_start),
      outcome: String(row.outcome || '—'),
      trades: this.asNumber(row.trades),
      size: this.asNumber(row.size),
      notional: this.asNumber(row.notional),
      vwap: this.asNullableNumber(row.vwap),
      closePrice: this.asNullableNumber(row.close_price),
      buySize,
      sellSize,
      imbalance,
      imbalanceRatio: this.imbalanceRatio(buySize, sellSize),
    };
  }

  public async upsertMarketTrades(trades: MarketTradeTick[]): Promise<number> {
    if (!trades.length) return 0;

    return this.runQueued(async (connection) => {
      const timestamp = new Date().toISOString();
      const sql = `
    INSERT INTO trades (
      trade_id,
      condition_id,
      market_id,
      token_id,
      outcome,
      side,
      price,
      size,
      "timestamp",
      transaction_hash,
      source,
      raw_json,
      updated_at
    )
    VALUES (
      $tradeId,
      $conditionId,
      $marketId,
      $tokenId,
      $outcome,
      $side,
      $price,
      $size,
      $timestampValue,
      $transactionHash,
      $source,
      $rawJson,
      $updatedAt
    )
    ON CONFLICT(trade_id) DO UPDATE SET
      condition_id = excluded.condition_id,
      market_id = excluded.market_id,
      token_id = excluded.token_id,
      outcome = excluded.outcome,
      side = excluded.side,
      price = excluded.price,
      size = excluded.size,
      "timestamp" = excluded."timestamp",
      transaction_hash = excluded.transaction_hash,
      source = excluded.source,
      raw_json = excluded.raw_json,
      updated_at = excluded.updated_at
  `;

      await connection.run('BEGIN TRANSACTION');
      try {
        for (const trade of trades) {
          const row = this.toStoredTrade(this._marketId, this._conditionId, trade);
          await connection.run(sql, {
            tradeId: row.tradeId,
            conditionId: row.conditionId,
            marketId: row.marketId,
            tokenId: row.tokenId,
            outcome: row.outcome,
            side: row.side,
            price: row.price,
            size: row.size,
            timestampValue: row.timestamp,
            transactionHash: row.transactionHash,
            source: row.source,
            rawJson: row.rawJson,
            updatedAt: timestamp,
          });
        }
        await connection.run('COMMIT');
      } catch (err) {
        await connection.run('ROLLBACK').catch(() => undefined);
        throw err;
      }

      return trades.length;
    });
  }

  public async countMarketTrades(): Promise<number> {
    return this.runQueued(async (connection) => {
      const reader = await connection.runAndReadAll(
        'SELECT count(*) AS total FROM trades WHERE market_id = $marketId AND condition_id = $conditionId',
        { marketId: this._marketId, conditionId: this._conditionId },
      );
      const row = reader.getRowObjectsJS()[0] as { total?: unknown } | undefined;
      return Number(row?.total ?? 0) || 0;
    });
  }

  public async listMarketTrades(
    query: MarketTradeRepositoryQuery,
    syncStatus: MarketTradeSyncStatus,
  ): Promise<MarketTradeListResult> {
    return this.runQueued(async (connection) => {
      const { where, values } = this.buildWhere(query);
      const limit = this.normalizeLimit(query.limit);
      const offset = this.normalizeOffset(query.offset);
      const sortField = this.normalizeSortField(query.sortField);
      const sortOrder = this.normalizeSortOrder(query.sortOrder);
      const direction = sortOrder === 'asc' ? 'ASC' : 'DESC';
      const orderBy = `${this.sortColumn(sortField)} ${direction} NULLS LAST, trade_id ${direction}`;

      const countReader = await connection.runAndReadAll(
        `SELECT count(*) AS total FROM trades ${where}`,
        values,
      );
      const totalRow = countReader.getRowObjectsJS()[0] as { total?: unknown } | undefined;
      const total = Number(totalRow?.total ?? 0) || 0;

      const reader = await connection.runAndReadAll(
        `
      SELECT
        trade_id,
        token_id,
        outcome,
        side,
        price,
        size,
        "timestamp" AS timestamp,
        transaction_hash,
        source
      FROM trades
      ${where}
      ORDER BY ${orderBy}
      LIMIT $limit OFFSET $offset
    `,
        { ...values, limit, offset },
      );

      const items = reader
        .getRowObjectsJS()
        .map((row) => this.rowToTrade(row as Record<string, unknown>));
      return {
        items,
        total,
        hasMore: offset + items.length < total,
        syncStatus,
        lastSyncedAt: syncStatus.lastSyncedAt,
        error: syncStatus.error,
      };
    });
  }

  public async getMarketTradeAnalysis(
    query: MarketTradeAnalysisRepositoryQuery,
    syncStatus: MarketTradeSyncStatus,
  ): Promise<MarketTradeAnalysisResult> {
    return this.runQueued(async (connection) => {
      const { where, values } = this.buildAnalysisWhere(query);
      const bucket = this.bucketSeconds(this.normalizeBucket(query.bucket));
      const summaryReader = await connection.runAndReadAll(
        `
        WITH filtered AS (
          SELECT * FROM trades ${where}
        ),
        latest AS (
          SELECT price AS latest_price
          FROM filtered
          WHERE price IS NOT NULL
          ORDER BY "timestamp" DESC NULLS LAST, trade_id DESC
          LIMIT 1
        )
        SELECT
          count(*) AS total_trades,
          coalesce(sum(size), 0) AS total_size,
          coalesce(sum(price * size), 0) AS notional,
          sum(price * size) / nullif(sum(size), 0) AS vwap,
          max(price) AS high_price,
          min(price) AS low_price,
          coalesce(sum(CASE WHEN side = 'BUY' THEN size ELSE 0 END), 0) AS buy_size,
          coalesce(sum(CASE WHEN side = 'SELL' THEN size ELSE 0 END), 0) AS sell_size,
          (SELECT latest_price FROM latest) AS latest_price
        FROM filtered
      `,
        values,
      );

      const breakdownSql = `
      SELECT
        coalesce({field}, '—') AS key,
        count(*) AS trades,
        coalesce(sum(size), 0) AS size,
        coalesce(sum(price * size), 0) AS notional,
        sum(price * size) / nullif(sum(size), 0) AS vwap,
        coalesce(sum(CASE WHEN side = 'BUY' THEN size ELSE 0 END), 0) AS buy_size,
        coalesce(sum(CASE WHEN side = 'SELL' THEN size ELSE 0 END), 0) AS sell_size
      FROM trades
      ${where}
      GROUP BY coalesce({field}, '—')
      ORDER BY size DESC
    `;
      const outcomeReader = await connection.runAndReadAll(
        breakdownSql.replaceAll('{field}', 'outcome'),
        values,
      );
      const sideReader = await connection.runAndReadAll(
        breakdownSql.replaceAll('{field}', 'side'),
        values,
      );
      const timeSeriesReader = await connection.runAndReadAll(
        `
        SELECT
          floor("timestamp" / $bucket) * $bucket AS bucket_start,
          coalesce(outcome, '—') AS outcome,
          count(*) AS trades,
          coalesce(sum(size), 0) AS size,
          coalesce(sum(price * size), 0) AS notional,
          sum(price * size) / nullif(sum(size), 0) AS vwap,
          arg_max(price, "timestamp") AS close_price,
          coalesce(sum(CASE WHEN side = 'BUY' THEN size ELSE 0 END), 0) AS buy_size,
          coalesce(sum(CASE WHEN side = 'SELL' THEN size ELSE 0 END), 0) AS sell_size
        FROM trades
        ${where}
        AND "timestamp" IS NOT NULL
        GROUP BY bucket_start, coalesce(outcome, '—')
        ORDER BY bucket_start ASC, outcome ASC
      `,
        { ...values, bucket },
      );
      const largeTradesReader = await connection.runAndReadAll(
        `
        SELECT
          trade_id,
          token_id,
          outcome,
          side,
          price,
          size,
          "timestamp" AS timestamp,
          transaction_hash,
          source
        FROM trades
        ${where}
        ORDER BY size DESC NULLS LAST, "timestamp" DESC NULLS LAST
        LIMIT $limit
      `,
        { ...values, limit: LARGE_TRADE_LIMIT },
      );

      return {
        summary: this.rowToSummary(summaryReader.getRowObjectsJS()[0] as Record<string, unknown>),
        outcomeBreakdown: outcomeReader
          .getRowObjectsJS()
          .map((row) => this.rowToBreakdown(row as Record<string, unknown>)),
        sideBreakdown: sideReader
          .getRowObjectsJS()
          .map((row) => this.rowToBreakdown(row as Record<string, unknown>)),
        timeSeries: timeSeriesReader
          .getRowObjectsJS()
          .map((row) => this.rowToPoint(row as Record<string, unknown>)),
        largeTrades: largeTradesReader
          .getRowObjectsJS()
          .map((row) => this.rowToTrade(row as Record<string, unknown>)),
        syncStatus,
        lastSyncedAt: syncStatus.lastSyncedAt,
        error: syncStatus.error,
      };
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
}

class MarketTradeRepositoryFactory {
  private static _instance: MarketTradeRepositoryFactory | null = null;

  private _baseDir = '';
  private readonly _repositories = new Map<string, DuckDbMarketTradeStore>();

  private constructor() {}

  public static getInstance(): MarketTradeRepositoryFactory {
    if (!this._instance) this._instance = new MarketTradeRepositoryFactory();
    return this._instance;
  }

  public setMarketTradeStoragePath(userDataPath: string): void {
    const normalized = String(userDataPath || '').trim();
    if (!normalized)
      throw new Error('userDataPath is required to initialize the trades DuckDB path');

    const nextBaseDir = path.join(normalized, TRADE_DIR);
    if (this._baseDir && this._baseDir !== nextBaseDir && this._repositories.size) {
      throw new Error('The trades DuckDB is already open, so the storage path cannot be changed');
    }

    this._baseDir = nextBaseDir;
    fs.mkdirSync(this._baseDir, { recursive: true });
  }

  public createMarketTradeRepository(marketId: string, conditionId: string): MarketTradeRepository {
    const normalizedMarketId = this.normalizeRequired(
      marketId,
      'marketId is required to access the trades DuckDB',
    );
    const normalizedConditionId = this.normalizeRequired(
      conditionId,
      'conditionId is required to access the trades DuckDB',
    );
    const key = this.repositoryKey(normalizedMarketId, normalizedConditionId);
    const cached = this._repositories.get(key);
    if (cached) return cached;

    const repository = new DuckDbMarketTradeStore(
      normalizedMarketId,
      normalizedConditionId,
      this.resolveDbPath(normalizedMarketId, normalizedConditionId),
    );
    this._repositories.set(key, repository);
    return repository;
  }

  public async closeMarketTradeRepository(): Promise<void> {
    const repositories = [...this._repositories.values()];
    this._repositories.clear();
    await Promise.allSettled(repositories.map((repository) => repository.close()));
  }

  private assertStoragePath(): string {
    if (!this._baseDir) throw new Error('Market trade storage path not configured');
    return this._baseDir;
  }

  private normalizeRequired(value: string, message: string): string {
    const normalized = String(value || '').trim();
    if (!normalized) throw new Error(message);
    return normalized;
  }

  private repositoryKey(marketId: string, conditionId: string): string {
    return `${marketId}\u0000${conditionId}`;
  }

  private hashValue(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private safeFileName(input: string): string {
    const normalized = input.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    return `${normalized || 'market'}-${this.hashValue(input).slice(0, 12)}.duckdb`;
  }

  private resolveDbPath(marketId: string, conditionId: string): string {
    const baseDir = this.assertStoragePath();
    const fileName = this.safeFileName(`${marketId}-${conditionId}`);
    const legacyFileName = this.safeFileName(conditionId);
    const dbPath = path.join(baseDir, fileName);
    const legacyDbPath = path.join(baseDir, legacyFileName);
    if (!fs.existsSync(dbPath) && fs.existsSync(legacyDbPath)) return legacyDbPath;
    return dbPath;
  }
}

export { MarketTradeRepositoryFactory };
