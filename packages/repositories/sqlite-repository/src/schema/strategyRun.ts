import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { strategyBots } from './bot.js';
import { strategies } from './strategy.js';
import { polymarketWallets } from './trading.js';

export const strategyRuns = sqliteTable(
  'strategy_runs',
  {
    id: text('id').primaryKey(),
    botId: text('bot_id').references(() => strategyBots.id, { onDelete: 'set null' }),
    marketId: text('market_id').notNull(),
    eventId: text('event_id').notNull(),
    conditionId: text('condition_id'),
    marketSnapshot: text('market_snapshot').notNull(),
    outcomesSnapshot: text('outcomes_snapshot').notNull(),
    assetId: text('asset_id').notNull(),
    strategyId: text('strategy_id')
      .notNull()
      .references(() => strategies.id, { onDelete: 'restrict' }),
    strategyName: text('strategy_name').notNull(),
    strategyVersion: integer('strategy_version').notNull(),
    strategySourceCode: text('strategy_source_code').notNull(),
    compiledCode: text('compiled_code').notNull(),
    walletId: text('wallet_id')
      .notNull()
      .references(() => polymarketWallets.id, { onDelete: 'restrict' }),
    walletName: text('wallet_name').notNull(),
    status: text('status').notNull(),
    config: text('config').notNull().default('{}'),
    runtimeError: text('runtime_error'),
    startedAt: text('started_at').notNull(),
    stoppedAt: text('stopped_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_strategy_runs_market_status').on(table.marketId, table.status),
    index('idx_strategy_runs_event_id').on(table.eventId),
    index('idx_strategy_runs_bot_id').on(table.botId),
    index('idx_strategy_runs_strategy_id').on(table.strategyId),
    index('idx_strategy_runs_wallet_id').on(table.walletId),
    index('idx_strategy_runs_started_at').on(table.startedAt),
  ],
);

export const strategyRunLogs = sqliteTable(
  'strategy_run_logs',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => strategyRuns.id, { onDelete: 'cascade' }),
    level: text('level').notNull(),
    module: text('module').notNull().default('strategy'),
    message: text('message').notNull(),
    time: text('time')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_strategy_run_logs_run_id').on(table.runId),
    index('idx_strategy_run_logs_time').on(table.time),
  ],
);

export const strategyRunOrders = sqliteTable(
  'strategy_run_orders',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => strategyRuns.id, { onDelete: 'cascade' }),
    walletId: text('wallet_id')
      .notNull()
      .references(() => polymarketWallets.id, { onDelete: 'restrict' }),
    strategyId: text('strategy_id')
      .notNull()
      .references(() => strategies.id, { onDelete: 'restrict' }),
    strategyVersion: integer('strategy_version').notNull(),
    marketId: text('market_id').notNull(),
    conditionId: text('condition_id'),
    input: text('input').notNull(),
    request: text('request').notNull(),
    response: text('response'),
    success: integer('success', { mode: 'boolean' }).notNull().default(false),
    exchangeOrderId: text('exchange_order_id'),
    status: text('status'),
    errorMessage: text('error_message'),
    submittedAt: text('submitted_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_strategy_run_orders_run_id').on(table.runId),
    index('idx_strategy_run_orders_wallet_id').on(table.walletId),
    index('idx_strategy_run_orders_market_id').on(table.marketId),
    index('idx_strategy_run_orders_condition_id').on(table.conditionId),
    index('idx_strategy_run_orders_submitted_at').on(table.submittedAt),
  ],
);
