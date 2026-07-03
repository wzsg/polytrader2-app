import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { polymarketWallets } from './trading.js';
import type { AccountOrderStatus } from '@polytrader/shared';

export const walletOrders = sqliteTable(
  'wallet_orders',
  {
    walletId: text('wallet_id')
      .notNull()
      .references(() => polymarketWallets.id, { onDelete: 'cascade' }),
    orderId: text('order_id').notNull(),
    conditionId: text('condition_id').notNull(),
    marketId: text('market_id'),
    eventId: text('event_id'),
    exchangeOrderId: text('exchange_order_id'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    status: text('status').$type<AccountOrderStatus>().notNull().default('pending'),
    orderType: text('order_type'),
    side: text('side'),
    assetId: text('asset_id'),
    outcome: text('outcome'),
    price: text('price'),
    shares: text('shares'),
    sizeMatched: text('size_matched'),
    amount: text('amount'),
    createdAt: integer('created_at'),
    inputJson: text('input_json'),
    requestJson: text('request_json'),
    responseJson: text('response_json'),
    errorMessage: text('error_message'),
    owner: text('owner'),
    makerAddress: text('maker_address'),
    expiration: text('expiration'),
    associateTradesJson: text('associate_trades_json'),
    submittedAt: text('submitted_at'),
    completedAt: text('completed_at'),
    firstSeenAt: text('first_seen_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    lastSeenAt: text('last_seen_at').notNull(),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    primaryKey({ columns: [table.walletId, table.orderId] }),
    check(
      'wallet_orders_status_check',
      sql`${table.status} IN ('pending', 'submitting', 'submitted', 'live', 'matched', 'delayed', 'unmatched', 'submit-failed', 'failed', 'rejected', 'canceled')`,
    ),
    uniqueIndex('idx_wallet_orders_exchange_order_id_unique')
      .on(table.exchangeOrderId)
      .where(sql`${table.exchangeOrderId} IS NOT NULL`),
    index('idx_wallet_orders_wallet_active').on(table.walletId, table.active),
    index('idx_wallet_orders_wallet_condition_active').on(
      table.walletId,
      table.conditionId,
      table.active,
    ),
    index('idx_wallet_orders_wallet_market').on(table.walletId, table.marketId),
    index('idx_wallet_orders_wallet_event').on(table.walletId, table.eventId),
    index('idx_wallet_orders_last_seen').on(table.lastSeenAt),
  ],
);

export const walletTrades = sqliteTable(
  'wallet_trades',
  {
    walletId: text('wallet_id')
      .notNull()
      .references(() => polymarketWallets.id, { onDelete: 'cascade' }),
    tradeId: text('trade_id').notNull(),
    conditionId: text('condition_id'),
    marketId: text('market_id'),
    eventId: text('event_id'),
    takerOrderId: text('taker_order_id'),
    assetId: text('asset_id'),
    side: text('side'),
    size: text('size'),
    feeRateBps: text('fee_rate_bps'),
    price: text('price'),
    status: text('status'),
    matchTime: text('match_time'),
    lastUpdate: text('last_update'),
    outcome: text('outcome'),
    bucketIndex: integer('bucket_index'),
    owner: text('owner'),
    makerAddress: text('maker_address'),
    transactionHash: text('transaction_hash'),
    traderSide: text('trader_side'),
    makerOrdersJson: text('maker_orders_json'),
    firstSeenAt: text('first_seen_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    primaryKey({ columns: [table.walletId, table.tradeId] }),
    index('idx_wallet_trades_wallet_match_time').on(table.walletId, table.matchTime),
    index('idx_wallet_trades_wallet_condition').on(table.walletId, table.conditionId),
    index('idx_wallet_trades_wallet_market').on(table.walletId, table.marketId),
    index('idx_wallet_trades_wallet_event').on(table.walletId, table.eventId),
  ],
);

export const walletPositions = sqliteTable(
  'wallet_positions',
  {
    walletId: text('wallet_id')
      .notNull()
      .references(() => polymarketWallets.id, { onDelete: 'cascade' }),
    positionId: text('position_id').notNull(),
    conditionId: text('condition_id'),
    marketId: text('market_id'),
    eventId: text('event_id'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    proxyWallet: text('proxy_wallet'),
    asset: text('asset'),
    size: real('size'),
    avgPrice: real('avg_price'),
    initialValue: real('initial_value'),
    currentValue: real('current_value'),
    cashPnl: real('cash_pnl'),
    percentPnl: real('percent_pnl'),
    totalBought: real('total_bought'),
    realizedPnl: real('realized_pnl'),
    percentRealizedPnl: real('percent_realized_pnl'),
    curPrice: real('cur_price'),
    redeemable: integer('redeemable', { mode: 'boolean' }),
    mergeable: integer('mergeable', { mode: 'boolean' }),
    title: text('title'),
    slug: text('slug'),
    icon: text('icon'),
    eventSlug: text('event_slug'),
    outcome: text('outcome'),
    outcomeIndex: integer('outcome_index'),
    oppositeOutcome: text('opposite_outcome'),
    oppositeAsset: text('opposite_asset'),
    endDate: text('end_date'),
    negativeRisk: integer('negative_risk', { mode: 'boolean' }),
    firstSeenAt: text('first_seen_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    lastSeenAt: text('last_seen_at').notNull(),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    primaryKey({ columns: [table.walletId, table.positionId] }),
    index('idx_wallet_positions_wallet_active').on(table.walletId, table.active),
    index('idx_wallet_positions_wallet_condition').on(table.walletId, table.conditionId),
    index('idx_wallet_positions_wallet_market').on(table.walletId, table.marketId),
    index('idx_wallet_positions_wallet_event').on(table.walletId, table.eventId),
    index('idx_wallet_positions_last_seen').on(table.lastSeenAt),
  ],
);
