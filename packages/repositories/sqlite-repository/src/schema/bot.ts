import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { strategies } from './strategy.js';
import { polymarketWallets } from './trading.js';

export const strategyBots = sqliteTable(
  'strategy_bots',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    marketId: text('market_id').notNull(),
    eventId: text('event_id').notNull(),
    conditionId: text('condition_id'),
    assetId: text('asset_id').notNull(),
    strategyId: text('strategy_id')
      .notNull()
      .references(() => strategies.id, { onDelete: 'restrict' }),
    strategyVersion: integer('strategy_version').notNull(),
    walletId: text('wallet_id')
      .notNull()
      .references(() => polymarketWallets.id, { onDelete: 'restrict' }),
    config: text('config').notNull().default('{}'),
    autoStart: integer('auto_start', { mode: 'boolean' }).notNull().default(false),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    status: text('status').notNull().default('idle'),
    activeRunId: text('active_run_id'),
    runtimeError: text('runtime_error'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_strategy_bots_market_id').on(table.marketId),
    uniqueIndex('idx_strategy_bots_name_unique').on(table.name),
    index('idx_strategy_bots_event_id').on(table.eventId),
    index('idx_strategy_bots_strategy_id').on(table.strategyId),
    index('idx_strategy_bots_wallet_id').on(table.walletId),
    index('idx_strategy_bots_status').on(table.status),
    index('idx_strategy_bots_auto_start').on(table.autoStart, table.enabled),
  ],
);
