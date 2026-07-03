import { contextBridge, ipcRenderer } from 'electron';
import type { IpcApi } from '@polytrader/shared';
import type { MarketTradeSyncStatus, TradingAccountDataEvent } from '@polytrader/shared';

export const windowApi: Pick<
  IpcApi,
  | 'windowMinimize'
  | 'windowMaximize'
  | 'windowClose'
  | 'windowIsMaximized'
  | 'windowSetAlwaysOnTop'
  | 'windowIsAlwaysOnTop'
  | 'onWindowMaximizedChanged'
> = {
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),
  windowIsMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  windowSetAlwaysOnTop: (pinned) => ipcRenderer.invoke('window:setAlwaysOnTop', pinned),
  windowIsAlwaysOnTop: () => ipcRenderer.invoke('window:isAlwaysOnTop'),
  onWindowMaximizedChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, maximized: boolean) => callback(maximized);
    ipcRenderer.on('window:maximized-changed', listener);
    return () => ipcRenderer.removeListener('window:maximized-changed', listener);
  },
};

export const preferenceApi: Pick<
  IpcApi,
  | 'getAppPreferences'
  | 'setLocalePreference'
  | 'setOrderConfirmationThresholdUsd'
  | 'onPreferencesChanged'
> = {
  getAppPreferences: () => ipcRenderer.invoke('preferences:get'),
  setLocalePreference: (preference) =>
    ipcRenderer.invoke('preferences:setLocalePreference', preference),
  setOrderConfirmationThresholdUsd: (thresholdUsd) =>
    ipcRenderer.invoke('preferences:setOrderConfirmationThresholdUsd', thresholdUsd),
  onPreferencesChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, preferences: unknown) =>
      callback(preferences as Parameters<typeof callback>[0]);
    ipcRenderer.on('preferences:changed', listener);
    return () => ipcRenderer.removeListener('preferences:changed', listener);
  },
};

export const marketDataApi: Pick<
  IpcApi,
  | 'fetchMarketDetail'
  | 'fetchMarketTrades'
  | 'startMarketTradeSync'
  | 'listMarketTrades'
  | 'getMarketTradeAnalysis'
  | 'onMarketTradesUpdated'
  | 'fetchPriceHistory'
> = {
  fetchMarketDetail: (marketId) => ipcRenderer.invoke('api:fetchMarketDetail', marketId),
  fetchMarketTrades: (conditionId, limit) =>
    ipcRenderer.invoke('api:fetchMarketTrades', conditionId, limit),
  startMarketTradeSync: (marketId, conditionId) =>
    ipcRenderer.invoke('api:startMarketTradeSync', marketId, conditionId),
  listMarketTrades: (query) => ipcRenderer.invoke('api:listMarketTrades', query),
  getMarketTradeAnalysis: (query) => ipcRenderer.invoke('api:getMarketTradeAnalysis', query),
  onMarketTradesUpdated: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, input: unknown) =>
      callback(input as MarketTradeSyncStatus);
    ipcRenderer.on('market-trades:updated', listener);
    return () => ipcRenderer.removeListener('market-trades:updated', listener);
  },
  fetchPriceHistory: (tokenId, interval, fidelity) =>
    ipcRenderer.invoke('api:fetchPriceHistory', tokenId, interval, fidelity),
};

export const tradingReadApi: Pick<
  IpcApi,
  | 'getTradingAccountStatus'
  | 'getTradingAccountData'
  | 'getTradingWalletOrders'
  | 'cancelTradingAccountOrder'
  | 'cancelTradingWalletOrders'
  | 'deleteFailedTradingAccountOrder'
  | 'cancelAllTradingWalletOrders'
  | 'getTradingWalletTrades'
  | 'getTradingWalletPositions'
  | 'splitTradingAccountPosition'
  | 'mergeTradingWalletPositions'
  | 'redeemTradingWalletPositions'
  | 'onTradingAccountEvent'
  | 'listPolymarketWallets'
> = {
  getTradingAccountStatus: (walletId) => ipcRenderer.invoke('trading-account:getStatus', walletId),
  getTradingAccountData: (query) => ipcRenderer.invoke('trading-account:queryAccount', query),
  getTradingWalletOrders: (query) => ipcRenderer.invoke('trading-account:queryOrders', query),
  cancelTradingAccountOrder: (id, walletId) =>
    ipcRenderer.invoke('trading-account:cancelOrder', id, walletId),
  cancelTradingWalletOrders: (ids, walletId) =>
    ipcRenderer.invoke('trading-account:cancelOrders', ids, walletId),
  deleteFailedTradingAccountOrder: (id, walletId) =>
    ipcRenderer.invoke('trading-account:deleteFailedOrder', id, walletId),
  cancelAllTradingWalletOrders: (walletId) =>
    ipcRenderer.invoke('trading-account:cancelAll', walletId),
  getTradingWalletTrades: (query) => ipcRenderer.invoke('trading-account:queryTrades', query),
  getTradingWalletPositions: (query) => ipcRenderer.invoke('trading-account:queryPositions', query),
  splitTradingAccountPosition: (input) =>
    ipcRenderer.invoke('trading-account:splitPosition', input),
  mergeTradingWalletPositions: (input) =>
    ipcRenderer.invoke('trading-account:mergePositions', input),
  redeemTradingWalletPositions: (input) =>
    ipcRenderer.invoke('trading-account:redeemPositions', input),
  onTradingAccountEvent: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, input: unknown) =>
      callback(input as TradingAccountDataEvent);
    ipcRenderer.on('trading-account:event', listener);
    return () => ipcRenderer.removeListener('trading-account:event', listener);
  },
  listPolymarketWallets: () => ipcRenderer.invoke('wallets:list'),
};

export function exposeApi(api: Partial<IpcApi>): void {
  contextBridge.exposeInMainWorld('api', api);
}
