import { ipcRenderer } from 'electron';
import type { IpcApi } from '@polytrader/shared';
import type {
  StrategyBotRuntimeEvent,
  StrategyRunRuntimeEvent,
  TradingMarketEvent,
  TradingStrategyStateEvent,
  TradingWindowInput,
} from '@polytrader/shared';
import {
  exposeApi,
  marketDataApi,
  preferenceApi,
  publicTraderApi,
  tradingAccountApi,
  walletReadApi,
  windowApi,
} from './common.js';

type TradingWindowIpcApi = Partial<Omit<IpcApi, 'wallet'>> & {
  wallet: Pick<IpcApi['wallet'], 'list'>;
};

const tradingWindowApi = {
  // App preferences and window controls.
  ...preferenceApi,
  ...windowApi,

  // Market basics and trade data.
  ...marketDataApi,
  ...publicTraderApi,
  fetchEvent: (request) => ipcRenderer.invoke('api:fetchEvent', request),

  // Account trading read data and manual trading actions.
  ...tradingAccountApi,
  ...walletReadApi,

  // Strategy catalog and bot runtime management.
  listStrategies: () => ipcRenderer.invoke('strategies:list'),
  listStrategyVersions: (strategyId) => ipcRenderer.invoke('strategies:versions', strategyId),
  listBots: (params) => ipcRenderer.invoke('bots:list', params),
  createBot: (input) => ipcRenderer.invoke('bots:create', input),
  updateBot: (input) => ipcRenderer.invoke('bots:update', input),
  deleteBot: (id) => ipcRenderer.invoke('bots:delete', id),
  startBot: (id) => ipcRenderer.invoke('bots:start', id),
  stopBot: (id) => ipcRenderer.invoke('bots:stop', id),
  getBotActiveRun: (id) => ipcRenderer.invoke('bots:getActiveRun', id),
  listBotRuns: (botId, limit) => ipcRenderer.invoke('bots:listRuns', botId, limit),
  getBotLogs: (runId, limit) => ipcRenderer.invoke('bots:getLogs', runId, limit),
  getBotOrders: (runId, limit) => ipcRenderer.invoke('bots:getOrders', runId, limit),
  onBotRuntimeEvent: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, input: unknown) =>
      callback(input as StrategyBotRuntimeEvent);
    ipcRenderer.on('bots:event', listener);
    return () => ipcRenderer.removeListener('bots:event', listener);
  },

  // Strategy run history, logs, orders, and realtime events.
  getActiveStrategyRun: (marketId) =>
    ipcRenderer.invoke('strategy-runs:getActiveByMarket', marketId),
  listStrategyRunHistory: (params) => ipcRenderer.invoke('strategy-runs:listHistory', params),
  getStrategyRunLogs: (runId, limit) => ipcRenderer.invoke('strategy-runs:getLogs', runId, limit),
  getStrategyRunOrders: (runId, limit) =>
    ipcRenderer.invoke('strategy-runs:getOrders', runId, limit),
  onStrategyRunEvent: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, input: unknown) =>
      callback(input as StrategyRunRuntimeEvent);
    ipcRenderer.on('strategy-runs:event', listener);
    return () => ipcRenderer.removeListener('strategy-runs:event', listener);
  },

  // Trading window lifecycle and parameter sync.
  onTradingWindowParams: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, input: unknown) =>
      callback(input as TradingWindowInput);
    ipcRenderer.on('trading-window:params', listener);
    return () => ipcRenderer.removeListener('trading-window:params', listener);
  },
  onTradingWindowCloseBlocked: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('trading-window:close-blocked', listener);
    return () => ipcRenderer.removeListener('trading-window:close-blocked', listener);
  },
  updateTradingWindowMarketScope: (marketIds) =>
    ipcRenderer.invoke('trading-window:update-market-scope', marketIds),
  confirmTradingWindowClose: () => ipcRenderer.invoke('trading-window:confirm-close'),
  onTradingWindowCloseRequested: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('trading-window:close-requested', listener);
    return () => ipcRenderer.removeListener('trading-window:close-requested', listener);
  },

  // Cross-window navigation entrypoints.
  openBotManagement: () => ipcRenderer.invoke('main-window:open-bots'),
  openPublicTraderWindow: (input) => ipcRenderer.invoke('public-trader:open', input),

  // Trading market snapshots, selections, price history, and trade analysis.
  tradingMarket: {
    subscribe: (input, options) => ipcRenderer.invoke('trading-market:subscribe', input, options),
    selectToken: (marketId, tokenId, outcome) =>
      ipcRenderer.invoke('trading-market:selectToken', marketId, tokenId, outcome),
    loadPriceHistory: (marketId, interval, fidelity) =>
      ipcRenderer.invoke('trading-market:loadPriceHistory', marketId, interval, fidelity),
    listTrades: (marketId, query) =>
      ipcRenderer.invoke('trading-market:listMarketTrades', marketId, query),
    getTradeAnalysis: (marketId, query) =>
      ipcRenderer.invoke('trading-market:getTradeAnalysis', marketId, query),
    unsubscribe: (marketId) => ipcRenderer.invoke('trading-market:unsubscribe', marketId),
    onEvent: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, input: unknown) =>
        callback(input as TradingMarketEvent);
      ipcRenderer.on('trading-market:event', listener);
      return () => ipcRenderer.removeListener('trading-market:event', listener);
    },
  },
  tradingStrategy: {
    getState: (marketId) => ipcRenderer.invoke('trading-strategy:getState', marketId),
    selectRun: (marketId, runId) =>
      ipcRenderer.invoke('trading-strategy:selectRun', marketId, runId),
    onEvent: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, input: unknown) =>
        callback(input as TradingStrategyStateEvent);
      ipcRenderer.on('trading-strategy:event', listener);
      return () => ipcRenderer.removeListener('trading-strategy:event', listener);
    },
  },
} satisfies TradingWindowIpcApi;

exposeApi(tradingWindowApi);
