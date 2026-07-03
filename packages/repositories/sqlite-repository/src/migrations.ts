import { mkdirSync } from 'fs';
import { dirname } from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

interface MigrateSqliteDatabaseOptions {
  dbPath: string;
  migrationsFolder: string;
}

interface MigrateSqliteDatabaseResult {
  tables: string[];
}

function migrateSqliteDatabase(options: MigrateSqliteDatabaseOptions): MigrateSqliteDatabaseResult {
  mkdirSync(dirname(options.dbPath), { recursive: true });
  const sqlite = new Database(options.dbPath);
  try {
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    migrate(drizzle(sqlite), { migrationsFolder: options.migrationsFolder });
    migrateLegacyAccountSchema(sqlite);
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((row) => String((row as { name: unknown }).name));
    return { tables };
  } finally {
    sqlite.close();
  }
}

function migrateLegacyAccountSchema(sqlite: Database.Database): void {
  sqlite.pragma('foreign_keys = OFF');
  try {
    sqlite.transaction(() => {
      renameTableIfNeeded(sqlite, 'polymarket_accounts', 'polymarket_wallets');
      renameTableIfNeeded(sqlite, 'account_orders', 'wallet_orders');
      renameTableIfNeeded(sqlite, 'account_trades', 'wallet_trades');
      renameTableIfNeeded(sqlite, 'account_positions', 'wallet_positions');

      renameColumnIfNeeded(sqlite, 'polymarket_wallets', 'parent_account_id', 'parent_wallet_id');
      renameColumnIfNeeded(sqlite, 'wallet_orders', 'account_id', 'wallet_id');
      renameColumnIfNeeded(sqlite, 'wallet_trades', 'account_id', 'wallet_id');
      renameColumnIfNeeded(sqlite, 'wallet_positions', 'account_id', 'wallet_id');
      renameColumnIfNeeded(sqlite, 'strategy_bots', 'account_id', 'wallet_id');
      renameColumnIfNeeded(sqlite, 'strategy_runs', 'account_id', 'wallet_id');
      renameColumnIfNeeded(sqlite, 'strategy_runs', 'account_name', 'wallet_name');
      renameColumnIfNeeded(sqlite, 'strategy_run_orders', 'account_id', 'wallet_id');

      rebuildWalletOrdersStatusConstraint(sqlite);
      recreateLegacyAccountIndexes(sqlite);
    })();
  } finally {
    sqlite.pragma('foreign_keys = ON');
  }
}

function rebuildWalletOrdersStatusConstraint(sqlite: Database.Database): void {
  const row = sqlite
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'wallet_orders'")
    .get() as { sql?: string } | undefined;
  if (!row?.sql?.includes('account_orders_status_check')) return;

  sqlite.exec(`
    ALTER TABLE "wallet_orders" RENAME TO "wallet_orders_legacy_constraint";
    CREATE TABLE "wallet_orders" (
      "wallet_id" text NOT NULL,
      "order_id" text NOT NULL,
      "condition_id" text NOT NULL,
      "market_id" text,
      "event_id" text,
      "exchange_order_id" text,
      "active" integer DEFAULT true NOT NULL,
      "status" text DEFAULT 'pending' NOT NULL,
      "order_type" text,
      "side" text,
      "asset_id" text,
      "outcome" text,
      "price" text,
      "shares" text,
      "size_matched" text,
      "amount" text,
      "created_at" integer,
      "input_json" text,
      "request_json" text,
      "response_json" text,
      "error_message" text,
      "owner" text,
      "maker_address" text,
      "expiration" text,
      "associate_trades_json" text,
      "submitted_at" text,
      "completed_at" text,
      "first_seen_at" text DEFAULT (datetime('now')) NOT NULL,
      "last_seen_at" text NOT NULL,
      "updated_at" text DEFAULT (datetime('now')) NOT NULL,
      PRIMARY KEY("wallet_id", "order_id"),
      FOREIGN KEY ("wallet_id") REFERENCES "polymarket_wallets"("id") ON UPDATE no action ON DELETE cascade,
      CONSTRAINT "wallet_orders_status_check" CHECK("wallet_orders"."status" IN ('pending', 'submitting', 'submitted', 'live', 'matched', 'delayed', 'unmatched', 'submit-failed', 'failed', 'rejected', 'canceled'))
    );
    INSERT INTO "wallet_orders" (
      "wallet_id", "order_id", "condition_id", "market_id", "event_id", "exchange_order_id",
      "active", "status", "order_type", "side", "asset_id", "outcome", "price", "shares",
      "size_matched", "amount", "created_at", "input_json", "request_json", "response_json",
      "error_message", "owner", "maker_address", "expiration", "associate_trades_json",
      "submitted_at", "completed_at", "first_seen_at", "last_seen_at", "updated_at"
    )
    SELECT
      "wallet_id", "order_id", "condition_id", "market_id", "event_id", "exchange_order_id",
      "active", "status", "order_type", "side", "asset_id", "outcome", "price", "shares",
      "size_matched", "amount", "created_at", "input_json", "request_json", "response_json",
      "error_message", "owner", "maker_address", "expiration", "associate_trades_json",
      "submitted_at", "completed_at", "first_seen_at", "last_seen_at", "updated_at"
    FROM "wallet_orders_legacy_constraint";
    DROP TABLE "wallet_orders_legacy_constraint";
  `);
}

function recreateLegacyAccountIndexes(sqlite: Database.Database): void {
  recreateIndexIfNeeded(
    sqlite,
    'idx_account_orders_exchange_order_id_unique',
    'idx_wallet_orders_exchange_order_id_unique',
    'CREATE UNIQUE INDEX "idx_wallet_orders_exchange_order_id_unique" ON "wallet_orders" ("exchange_order_id") WHERE "wallet_orders"."exchange_order_id" IS NOT NULL',
  );
  recreateIndexIfNeeded(
    sqlite,
    'idx_account_orders_account_active',
    'idx_wallet_orders_wallet_active',
    'CREATE INDEX "idx_wallet_orders_wallet_active" ON "wallet_orders" ("wallet_id", "active")',
  );
  recreateIndexIfNeeded(
    sqlite,
    'idx_account_orders_account_condition_active',
    'idx_wallet_orders_wallet_condition_active',
    'CREATE INDEX "idx_wallet_orders_wallet_condition_active" ON "wallet_orders" ("wallet_id", "condition_id", "active")',
  );
  recreateIndexIfNeeded(
    sqlite,
    'idx_account_orders_account_market',
    'idx_wallet_orders_wallet_market',
    'CREATE INDEX "idx_wallet_orders_wallet_market" ON "wallet_orders" ("wallet_id", "market_id")',
  );
  recreateIndexIfNeeded(
    sqlite,
    'idx_account_orders_account_event',
    'idx_wallet_orders_wallet_event',
    'CREATE INDEX "idx_wallet_orders_wallet_event" ON "wallet_orders" ("wallet_id", "event_id")',
  );
  recreateIndexIfNeeded(
    sqlite,
    'idx_account_orders_last_seen',
    'idx_wallet_orders_last_seen',
    'CREATE INDEX "idx_wallet_orders_last_seen" ON "wallet_orders" ("last_seen_at")',
  );
  recreateIndexIfNeeded(
    sqlite,
    'idx_account_positions_account_active',
    'idx_wallet_positions_wallet_active',
    'CREATE INDEX "idx_wallet_positions_wallet_active" ON "wallet_positions" ("wallet_id", "active")',
  );
  recreateIndexIfNeeded(
    sqlite,
    'idx_account_positions_account_condition',
    'idx_wallet_positions_wallet_condition',
    'CREATE INDEX "idx_wallet_positions_wallet_condition" ON "wallet_positions" ("wallet_id", "condition_id")',
  );
  recreateIndexIfNeeded(
    sqlite,
    'idx_account_positions_account_market',
    'idx_wallet_positions_wallet_market',
    'CREATE INDEX "idx_wallet_positions_wallet_market" ON "wallet_positions" ("wallet_id", "market_id")',
  );
  recreateIndexIfNeeded(
    sqlite,
    'idx_account_positions_account_event',
    'idx_wallet_positions_wallet_event',
    'CREATE INDEX "idx_wallet_positions_wallet_event" ON "wallet_positions" ("wallet_id", "event_id")',
  );
  recreateIndexIfNeeded(
    sqlite,
    'idx_account_positions_last_seen',
    'idx_wallet_positions_last_seen',
    'CREATE INDEX "idx_wallet_positions_last_seen" ON "wallet_positions" ("last_seen_at")',
  );
  recreateIndexIfNeeded(
    sqlite,
    'idx_account_trades_account_match_time',
    'idx_wallet_trades_wallet_match_time',
    'CREATE INDEX "idx_wallet_trades_wallet_match_time" ON "wallet_trades" ("wallet_id", "match_time")',
  );
  recreateIndexIfNeeded(
    sqlite,
    'idx_account_trades_account_condition',
    'idx_wallet_trades_wallet_condition',
    'CREATE INDEX "idx_wallet_trades_wallet_condition" ON "wallet_trades" ("wallet_id", "condition_id")',
  );
  recreateIndexIfNeeded(
    sqlite,
    'idx_account_trades_account_market',
    'idx_wallet_trades_wallet_market',
    'CREATE INDEX "idx_wallet_trades_wallet_market" ON "wallet_trades" ("wallet_id", "market_id")',
  );
  recreateIndexIfNeeded(
    sqlite,
    'idx_account_trades_account_event',
    'idx_wallet_trades_wallet_event',
    'CREATE INDEX "idx_wallet_trades_wallet_event" ON "wallet_trades" ("wallet_id", "event_id")',
  );
  recreateIndexIfNeeded(
    sqlite,
    'idx_polymarket_accounts_default',
    'idx_polymarket_wallets_default',
    'CREATE INDEX "idx_polymarket_wallets_default" ON "polymarket_wallets" ("is_default")',
  );
  recreateIndexIfNeeded(
    sqlite,
    'idx_polymarket_accounts_name',
    'idx_polymarket_wallets_name',
    'CREATE INDEX "idx_polymarket_wallets_name" ON "polymarket_wallets" ("name")',
  );
  recreateIndexIfNeeded(
    sqlite,
    'idx_polymarket_accounts_parent_account_id',
    'idx_polymarket_wallets_parent_wallet_id',
    'CREATE INDEX "idx_polymarket_wallets_parent_wallet_id" ON "polymarket_wallets" ("parent_wallet_id")',
  );
  recreateIndexIfNeeded(
    sqlite,
    'idx_strategy_bots_account_id',
    'idx_strategy_bots_wallet_id',
    'CREATE INDEX "idx_strategy_bots_wallet_id" ON "strategy_bots" ("wallet_id")',
  );
  recreateIndexIfNeeded(
    sqlite,
    'idx_strategy_runs_account_id',
    'idx_strategy_runs_wallet_id',
    'CREATE INDEX "idx_strategy_runs_wallet_id" ON "strategy_runs" ("wallet_id")',
  );
  recreateIndexIfNeeded(
    sqlite,
    'idx_strategy_run_orders_account_id',
    'idx_strategy_run_orders_wallet_id',
    'CREATE INDEX "idx_strategy_run_orders_wallet_id" ON "strategy_run_orders" ("wallet_id")',
  );
}

function recreateIndexIfNeeded(
  sqlite: Database.Database,
  from: string,
  to: string,
  createSql: string,
): void {
  if (!indexExists(sqlite, from) || indexExists(sqlite, to)) return;
  sqlite.exec(`DROP INDEX ${quoteIdentifier(from)}`);
  sqlite.exec(createSql);
}

function renameTableIfNeeded(sqlite: Database.Database, from: string, to: string): void {
  if (!tableExists(sqlite, from) || tableExists(sqlite, to)) return;
  sqlite.exec(`ALTER TABLE ${quoteIdentifier(from)} RENAME TO ${quoteIdentifier(to)}`);
}

function renameColumnIfNeeded(
  sqlite: Database.Database,
  table: string,
  from: string,
  to: string,
): void {
  if (!tableExists(sqlite, table)) return;
  if (!columnExists(sqlite, table, from) || columnExists(sqlite, table, to)) return;
  sqlite.exec(
    `ALTER TABLE ${quoteIdentifier(table)} RENAME COLUMN ${quoteIdentifier(from)} TO ${quoteIdentifier(to)}`,
  );
}

function tableExists(sqlite: Database.Database, table: string): boolean {
  const row = sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table);
  return Boolean(row);
}

function indexExists(sqlite: Database.Database, index: string): boolean {
  const row = sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ?")
    .get(index);
  return Boolean(row);
}

function columnExists(sqlite: Database.Database, table: string, column: string): boolean {
  return sqlite
    .prepare(`PRAGMA table_info(${quoteIdentifier(table)})`)
    .all()
    .some((row) => String((row as { name: unknown }).name) === column);
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export { migrateSqliteDatabase };
export type { MigrateSqliteDatabaseOptions, MigrateSqliteDatabaseResult };
