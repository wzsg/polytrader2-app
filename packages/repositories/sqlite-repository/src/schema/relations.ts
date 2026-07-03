import { relations } from 'drizzle-orm';
import { walletOrders, walletPositions, walletTrades } from './walletData.js';
import { strategyBots } from './bot.js';
import { eventTags, events, markets, watchlist } from './market.js';
import { strategies, strategyVersions } from './strategy.js';
import { strategyRunLogs, strategyRunOrders, strategyRuns } from './strategyRun.js';
import { polymarketWallets } from './trading.js';

export const eventsRelations = relations(events, ({ many }) => ({
  markets: many(markets),
  tags: many(eventTags),
  watchlist: many(watchlist),
}));

export const marketsRelations = relations(markets, ({ one }) => ({
  event: one(events, {
    fields: [markets.eventId],
    references: [events.id],
  }),
}));

export const watchlistRelations = relations(watchlist, ({ one }) => ({
  event: one(events, {
    fields: [watchlist.eventId],
    references: [events.id],
  }),
}));

export const eventTagsRelations = relations(eventTags, ({ one }) => ({
  event: one(events, {
    fields: [eventTags.eventId],
    references: [events.id],
  }),
}));

export const polymarketWalletsRelations = relations(polymarketWallets, ({ many }) => ({
  strategyBots: many(strategyBots),
  strategyRuns: many(strategyRuns),
  strategyRunOrders: many(strategyRunOrders),
  walletOrders: many(walletOrders),
  walletTrades: many(walletTrades),
  walletPositions: many(walletPositions),
}));

export const walletOrdersRelations = relations(walletOrders, ({ one }) => ({
  wallet: one(polymarketWallets, {
    fields: [walletOrders.walletId],
    references: [polymarketWallets.id],
  }),
}));

export const walletTradesRelations = relations(walletTrades, ({ one }) => ({
  wallet: one(polymarketWallets, {
    fields: [walletTrades.walletId],
    references: [polymarketWallets.id],
  }),
}));

export const walletPositionsRelations = relations(walletPositions, ({ one }) => ({
  wallet: one(polymarketWallets, {
    fields: [walletPositions.walletId],
    references: [polymarketWallets.id],
  }),
}));

export const strategiesRelations = relations(strategies, ({ many }) => ({
  versions: many(strategyVersions),
  strategyBots: many(strategyBots),
  strategyRuns: many(strategyRuns),
  strategyRunOrders: many(strategyRunOrders),
}));

export const strategyVersionsRelations = relations(strategyVersions, ({ one }) => ({
  strategy: one(strategies, {
    fields: [strategyVersions.strategyId],
    references: [strategies.id],
  }),
}));

export const strategyBotsRelations = relations(strategyBots, ({ one, many }) => ({
  strategy: one(strategies, {
    fields: [strategyBots.strategyId],
    references: [strategies.id],
  }),
  account: one(polymarketWallets, {
    fields: [strategyBots.walletId],
    references: [polymarketWallets.id],
  }),
  runs: many(strategyRuns),
}));

export const strategyRunsRelations = relations(strategyRuns, ({ one, many }) => ({
  bot: one(strategyBots, {
    fields: [strategyRuns.botId],
    references: [strategyBots.id],
  }),
  strategy: one(strategies, {
    fields: [strategyRuns.strategyId],
    references: [strategies.id],
  }),
  account: one(polymarketWallets, {
    fields: [strategyRuns.walletId],
    references: [polymarketWallets.id],
  }),
  logs: many(strategyRunLogs),
  orders: many(strategyRunOrders),
}));

export const strategyRunLogsRelations = relations(strategyRunLogs, ({ one }) => ({
  run: one(strategyRuns, {
    fields: [strategyRunLogs.runId],
    references: [strategyRuns.id],
  }),
}));

export const strategyRunOrdersRelations = relations(strategyRunOrders, ({ one }) => ({
  run: one(strategyRuns, {
    fields: [strategyRunOrders.runId],
    references: [strategyRuns.id],
  }),
  account: one(polymarketWallets, {
    fields: [strategyRunOrders.walletId],
    references: [polymarketWallets.id],
  }),
  strategy: one(strategies, {
    fields: [strategyRunOrders.strategyId],
    references: [strategies.id],
  }),
}));
