import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const strategies = sqliteTable(
  'strategies',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    currentVersion: integer('current_version').notNull().default(1),
    sourceCode: text('source_code').notNull(),
    compiledCode: text('compiled_code'),
    compileStatus: text('compile_status').notNull().default('pending'),
    compileError: text('compile_error'),
    deletedAt: text('deleted_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_strategies_deleted_at').on(table.deletedAt),
    index('idx_strategies_name').on(table.name),
  ],
);

export const strategyVersions = sqliteTable(
  'strategy_versions',
  {
    id: text('id').primaryKey(),
    strategyId: text('strategy_id')
      .notNull()
      .references(() => strategies.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    name: text('name').notNull(),
    sourceCode: text('source_code').notNull(),
    compiledCode: text('compiled_code'),
    compileStatus: text('compile_status').notNull(),
    compileError: text('compile_error'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_strategy_versions_strategy_id').on(table.strategyId),
    index('idx_strategy_versions_version').on(table.strategyId, table.version),
  ],
);
