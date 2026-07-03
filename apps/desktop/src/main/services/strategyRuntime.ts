import { app } from 'electron';
import {
  StrategyBotRuntimeService,
  strategyRunHistoryService,
  type StrategyRuntimePorts,
} from '@polytrader/strategy-runtime';
import type { TradingMarketRuntime } from '@polytrader/trading-market';
import type { StrategyExecutorRuntimePaths } from '@polytrader/bot-runtime-contract';
import type { BalanceAllowance, TradingAccountDataEvent } from '@polytrader/shared';
import { polymarketWalletService } from './polymarketWalletService.js';
import { tradingAccountService } from './tradingAccountService.js';
import { tradingMarketService } from './tradingMarketService.js';

function getStrategyExecutorRuntimePaths(): StrategyExecutorRuntimePaths {
  return {
    appPath: app.getAppPath(),
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
  };
}

function requireTradingMarketRuntime(marketId: string): TradingMarketRuntime {
  const market = tradingMarketService.getMarket(marketId);
  if (!market) throw new Error(`Trading market runtime does not exist: ${marketId}`);
  return market;
}

const strategyRuntimePorts: StrategyRuntimePorts = {
  marketRuntime: {
    subscribe: (input, options) => tradingMarketService.subscribe(input, options),
    getSnapshot: (marketId) => tradingMarketService.getSnapshot(marketId),
    loadMarketDetail: (marketId) => requireTradingMarketRuntime(marketId).loadMarketDetail(),
    loadPriceHistory: (marketId, interval, fidelity) =>
      requireTradingMarketRuntime(marketId).loadPriceHistory(interval, fidelity),
    loadTrades: (marketId) => requireTradingMarketRuntime(marketId).loadTrades(),
  },
  accounts: {
    getCredential: (walletId) => polymarketWalletService.getPolymarketWalletCredential(walletId),
    getSummary: (walletId) => polymarketWalletService.getPolymarketWalletSummary(walletId),
    queryAccount: (query) => tradingAccountService.queryAccount(query),
    syncAccountNow: (walletId) => tradingAccountService.syncAccountNow(walletId),
    onDataEvent: (callback) => subscribeTradingAccountDataEvent(callback),
  },
  executor: {
    getRuntimePaths: getStrategyExecutorRuntimePaths,
  },
  orders: {
    placeStrategyOrder: (input) => tradingAccountService.placeStrategyOrder(input),
    cancelOrder: (input) => tradingAccountService.cancelOrder(input),
    cancelAllOrders: (input) => tradingAccountService.cancelAllOrders(input),
  },
};

function subscribeTradingAccountDataEvent(
  callback: (event: TradingAccountDataEvent) => void,
): () => void {
  const broadcastOrderDataChanged = (event: {
    walletId: string;
    reason: string;
    at: string;
  }): void => {
    callback({
      type: 'orders-changed',
      walletId: event.walletId,
      reason: event.reason,
      at: event.at,
    });
  };
  const broadcastPositionDataChanged = (event: {
    walletId: string;
    reason: string;
    positionsTotalValue?: number | null;
    positionsInitialValue?: number | null;
    at: string;
  }): void => {
    if (event.reason === 'sync-position-summary') {
      callback({
        type: 'position-summary-changed',
        walletId: event.walletId,
        reason: event.reason,
        positionsTotalValue: event.positionsTotalValue ?? null,
        positionsInitialValue: event.positionsInitialValue ?? null,
        at: event.at,
      });
      return;
    }
    callback({
      type: 'positions-changed',
      walletId: event.walletId,
      reason: event.reason,
      at: event.at,
    });
  };
  const broadcastTradeDataChanged = (event: {
    walletId: string;
    reason: string;
    at: string;
  }): void => {
    callback({
      type: 'trades-changed',
      walletId: event.walletId,
      reason: event.reason,
      at: event.at,
    });
  };
  const broadcastBalanceChanged = (event: {
    walletId: string;
    reason: string;
    balance: BalanceAllowance;
    at: string;
  }): void => {
    callback({
      type: 'balance-changed',
      walletId: event.walletId,
      reason: event.reason,
      balance: event.balance,
      at: event.at,
    });
  };

  tradingAccountService.on('balance-sync-event', broadcastBalanceChanged);
  tradingAccountService.on('order-trading-event', broadcastOrderDataChanged);
  tradingAccountService.on('order-sync-event', broadcastOrderDataChanged);
  tradingAccountService.on('position-sync-event', broadcastPositionDataChanged);
  tradingAccountService.on('trade-sync-event', broadcastTradeDataChanged);
  return () => {
    tradingAccountService.off('balance-sync-event', broadcastBalanceChanged);
    tradingAccountService.off('order-trading-event', broadcastOrderDataChanged);
    tradingAccountService.off('order-sync-event', broadcastOrderDataChanged);
    tradingAccountService.off('position-sync-event', broadcastPositionDataChanged);
    tradingAccountService.off('trade-sync-event', broadcastTradeDataChanged);
  };
}

const botRuntimeService = new StrategyBotRuntimeService({
  ports: strategyRuntimePorts,
  runHistoryService: strategyRunHistoryService,
});

export { botRuntimeService, strategyRunHistoryService };
