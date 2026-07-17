import { contextBridge, ipcRenderer } from 'electron';
import type { IpcApi } from '@polytrader/shared';
import type {
  MarketTradeSyncStatus,
  PolymarketBridgeWithdrawalEvent,
  PolymarketWalletEvent,
  TradingAccountDataEvent,
} from '@polytrader/shared';

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
  | 'setEventSyncBatchSize'
  | 'setPerformanceMonitoringEnabled'
  | 'onPreferencesChanged'
> = {
  getAppPreferences: () => ipcRenderer.invoke('preferences:get'),
  setLocalePreference: (preference) =>
    ipcRenderer.invoke('preferences:setLocalePreference', preference),
  setOrderConfirmationThresholdUsd: (thresholdUsd) =>
    ipcRenderer.invoke('preferences:setOrderConfirmationThresholdUsd', thresholdUsd),
  setEventSyncBatchSize: (batchSize) =>
    ipcRenderer.invoke('preferences:setEventSyncBatchSize', batchSize),
  setPerformanceMonitoringEnabled: (enabled) =>
    ipcRenderer.invoke('preferences:setPerformanceMonitoringEnabled', enabled),
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

export const tradingAccountApi: Pick<IpcApi, 'tradingAccount'> = {
  tradingAccount: {
    getStatus: (walletId) => ipcRenderer.invoke('trading-account:getStatus', walletId),
    getData: (query) => ipcRenderer.invoke('trading-account:queryAccount', query),
    getOrders: (query) => ipcRenderer.invoke('trading-account:queryOrders', query),
    cancelOrder: (id, walletId) => ipcRenderer.invoke('trading-account:cancelOrder', id, walletId),
    cancelOrders: (ids, walletId) =>
      ipcRenderer.invoke('trading-account:cancelOrders', ids, walletId),
    deleteFailedOrder: (id, walletId) =>
      ipcRenderer.invoke('trading-account:deleteFailedOrder', id, walletId),
    cancelAllOrders: (walletId) => ipcRenderer.invoke('trading-account:cancelAll', walletId),
    getTrades: (query) => ipcRenderer.invoke('trading-account:queryTrades', query),
    getPositions: (query) => ipcRenderer.invoke('trading-account:queryPositions', query),
    placeOrder: (input) => ipcRenderer.invoke('trading-account:placeManualOrder', input),
    splitPosition: (input) => ipcRenderer.invoke('trading-account:splitPosition', input),
    mergePositions: (input) => ipcRenderer.invoke('trading-account:mergePositions', input),
    redeemPositions: (input) => ipcRenderer.invoke('trading-account:redeemPositions', input),
    onEvent: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, input: unknown) =>
        callback(input as TradingAccountDataEvent);
      ipcRenderer.on('trading-account:event', listener);
      return () => ipcRenderer.removeListener('trading-account:event', listener);
    },
  },
};

export const walletApi: Pick<IpcApi, 'wallet'> = {
  wallet: {
    list: () => ipcRenderer.invoke('wallets:list'),
    getKeyMaterial: (id) => ipcRenderer.invoke('wallets:getKeyMaterial', id),
    create: (input) => ipcRenderer.invoke('wallets:create', input),
    createDerived: (input) => ipcRenderer.invoke('wallets:createDerived', input),
    import: (input) => ipcRenderer.invoke('wallets:import', input),
    update: (input) => ipcRenderer.invoke('wallets:update', input),
    markKeyMaterialBackedUp: (id) => ipcRenderer.invoke('wallets:markKeyMaterialBackedUp', id),
    retryInitialization: (id) => ipcRenderer.invoke('wallets:retryInitialization', id),
    setDefault: (id) => ipcRenderer.invoke('wallets:setDefault', id),
    delete: (id) => ipcRenderer.invoke('wallets:delete', id),
    onEvent: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, input: unknown) =>
        callback(input as PolymarketWalletEvent);
      ipcRenderer.on('wallets:event', listener);
      return () => ipcRenderer.removeListener('wallets:event', listener);
    },
  },
};

export const walletReadApi = {
  wallet: {
    list: () => ipcRenderer.invoke('wallets:list'),
  },
} satisfies { wallet: Pick<IpcApi['wallet'], 'list'> };

export const crossChainApi: Pick<IpcApi, 'crossChain'> = {
  crossChain: {
    listSupportedAssets: () => ipcRenderer.invoke('bridge:listSupportedAssets'),
    createDeposit: (input) => ipcRenderer.invoke('bridge:createDeposit', input),
    quoteTransfer: (input) => ipcRenderer.invoke('bridge:quote', input),
    withdraw: (input) => ipcRenderer.invoke('bridge:withdraw', input),
    getTransactionStatus: (address) => ipcRenderer.invoke('bridge:getTransactionStatus', address),
    listWithdrawals: (walletId, limit) =>
      ipcRenderer.invoke('bridge:listWithdrawals', walletId, limit),
    onWithdrawalEvent: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, input: unknown) =>
        callback(input as PolymarketBridgeWithdrawalEvent);
      ipcRenderer.on('bridge:withdrawal-event', listener);
      return () => ipcRenderer.removeListener('bridge:withdrawal-event', listener);
    },
  },
};

type IpcApiExposure = Omit<Partial<IpcApi>, 'wallet'> & {
  wallet?: Partial<IpcApi['wallet']>;
};

export function exposeApi(api: IpcApiExposure): void {
  contextBridge.exposeInMainWorld('api', api);
}
