import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey(),
    locale: text('locale').notNull().default('en-US'),
    title: text('title').notNull(),
    slug: text('slug'),
    image: text('image'),
    volume: real('volume').default(0),
    volume24hr: real('volume24hr').default(0),
    liquidity: real('liquidity').default(0),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    closed: integer('closed', { mode: 'boolean' }).notNull().default(false),
    marketCount: integer('market_count').default(0),
    startDate: text('start_date'),
    endDate: text('end_date'),
    category: text('category'),
    featured: integer('featured', { mode: 'boolean' }).default(false),
    parentEventId: text('parent_event_id'),
    teams: text('teams'),
    updatedAt: text('updated_at'),
  },
  (table) => [
    index('idx_events_volume24hr').on(table.volume24hr),
    index('idx_events_active').on(table.active),
    index('idx_events_parent_event_id').on(table.parentEventId),
    index('idx_events_active_closed_parent_end').on(
      table.active,
      table.closed,
      table.parentEventId,
      table.endDate,
    ),
  ],
);

export const markets = sqliteTable(
  'markets',
  {
    id: text('id').primaryKey(),
    locale: text('locale').notNull().default('en-US'),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    question: text('question'),
    slug: text('slug'),
    groupItemTitle: text('group_item_title'),
    conditionId: text('condition_id'),
    image: text('image'),
    icon: text('icon'),
    active: integer('active', { mode: 'boolean' }).notNull().default(false),
    closed: integer('closed', { mode: 'boolean' }).notNull().default(false),
    negRisk: integer('negative_risk', { mode: 'boolean' }).notNull(),
    outcomes: text('outcomes'),
    outcomePrices: text('outcome_prices'),
    clobTokenIds: text('clob_token_ids'),
    clobTokenIds0: text('clob_token_ids_0'),
    clobTokenIds1: text('clob_token_ids_1'),
    outcomes0: text('outcomes_0'),
    outcomes1: text('outcomes_1'),
    outcomePrices0: text('outcome_prices_0'),
    outcomePrices1: text('outcome_prices_1'),
    volume: real('volume').default(0),
    volume24hr: real('volume24hr').default(0),
    liquidity: real('liquidity').default(0),
    updatedAt: text('updated_at'),
  },
  (table) => [
    index('idx_markets_event_id').on(table.eventId),
    uniqueIndex('idx_markets_condition_id_unique').on(table.conditionId),
    uniqueIndex('idx_markets_clob_token_ids_0_unique').on(table.clobTokenIds0),
    uniqueIndex('idx_markets_clob_token_ids_1_unique').on(table.clobTokenIds1),
  ],
);

export const watchlist = sqliteTable(
  'watchlist',
  {
    eventId: text('event_id')
      .primaryKey()
      .references(() => events.id, { onDelete: 'cascade' }),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [index('idx_watchlist_created_at').on(table.createdAt)],
);

export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const appPreferences = sqliteTable('app_preferences', {
  id: text('id').primaryKey(),
  localePreference: text('locale_preference').notNull(),
  orderConfirmationThresholdUsd: real('order_confirmation_threshold_usd').notNull().default(100),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const eventTags = sqliteTable(
  'event_tags',
  {
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    tagId: text('tag_id').notNull(),
    label: text('label'),
    slug: text('slug'),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.tagId] }),
    index('idx_event_tags_tag_id').on(table.tagId),
    index('idx_event_tags_tag_event').on(table.tagId, table.eventId),
  ],
);
