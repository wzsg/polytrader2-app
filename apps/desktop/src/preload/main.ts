import { ipcRenderer } from 'electron';
import type { IpcApi } from '@polytrader/shared';
import type { PolymarketWalletEvent, StrategyBotRuntimeEvent } from '@polytrader/shared';
import { exposeApi, marketDataApi, preferenceApi, tradingReadApi, windowApi } from './common.js';

const mainWindowApi = {
  getAuthState: () => ipcRenderer.invoke('auth:getState'),
  signUpWithEmail: (input) => ipcRenderer.invoke('auth:signUpWithEmail', input),
  signInWithEmail: (input) => ipcRenderer.invoke('auth:signInWithEmail', input),
  signInWithProvider: (provider) => ipcRenderer.invoke('auth:signInWithProvider', provider),
  resendSignupConfirmation: (email) => ipcRenderer.invoke('auth:resendSignupConfirmation', email),
  signOut: () => ipcRenderer.invoke('auth:signOut'),
  syncUserData: () => ipcRenderer.invoke('auth:syncUserData'),
  onAuthChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, input: unknown) =>
      callback(input as Parameters<typeof callback>[0]);
    ipcRenderer.on('auth:changed', listener);
    return () => ipcRenderer.removeListener('auth:changed', listener);
  },
  ...preferenceApi,
  startSync: () => ipcRenderer.send('sync:start'),
  onSyncStatus: (callback) => {
    ipcRenderer.on('sync:status', (_event, data) => callback(data));
  },
  getSyncScheduleConfig: () => ipcRenderer.invoke('sync:schedule:get'),
  setSyncScheduleConfig: (config) => ipcRenderer.invoke('sync:schedule:set', config),
  getMcpServerConfig: () => ipcRenderer.invoke('mcp:getConfig'),
  setMcpServerConfig: (config) => ipcRenderer.invoke('mcp:setConfig', config),
  resetMcpServerToken: () => ipcRenderer.invoke('mcp:resetToken'),
  getMcpServerStatus: () => ipcRenderer.invoke('mcp:getStatus'),
  getDeveloperModeConfig: () => ipcRenderer.invoke('developer:getModeConfig'),
  setDeveloperModeConfig: (config) => ipcRenderer.invoke('developer:setModeConfig', config),
  listDeveloperMcpAccessLogs: (limit) => ipcRenderer.invoke('developer:listMcpAccessLogs', limit),
  listDeveloperOrderRecords: (limit) => ipcRenderer.invoke('developer:listOrderRecords', limit),
  listDeveloperWorkflowTasks: (limit) => ipcRenderer.invoke('developer:listWorkflowTasks', limit),
  listEvents: (params) => ipcRenderer.invoke('db:list', params),
  listChildEvents: (parentEventId) => ipcRenderer.invoke('db:listChildren', parentEventId),
  countEvents: (params) => ipcRenderer.invoke('db:count', params),
  getTotalCount: () => ipcRenderer.invoke('db:total'),
  countEventsByTags: (tagIds) => ipcRenderer.invoke('db:countByTags', tagIds),
  countActiveByTags: (tagIds) => ipcRenderer.invoke('db:countActiveByTags', tagIds),
  getCacheStats: () => ipcRenderer.invoke('db:cacheStats'),
  countActive: () => ipcRenderer.invoke('db:active'),
  getWatchlistEventIds: () => ipcRenderer.invoke('watchlist:list'),
  addToWatchlist: (eventId) => ipcRenderer.invoke('watchlist:add', eventId),
  removeFromWatchlist: (eventId) => ipcRenderer.invoke('watchlist:remove', eventId),
  countWatchlist: () => ipcRenderer.invoke('watchlist:count'),
  loadFilters: () => ipcRenderer.invoke('filters:load'),
  saveFilters: (data) => ipcRenderer.invoke('filters:save', data),
  fetchEvent: (eventId) => ipcRenderer.invoke('api:fetchEvent', eventId),
  fetchCryptoCategory: () => ipcRenderer.invoke('api:fetchCryptoCategory'),
  fetchEventCategory: () => ipcRenderer.invoke('api:fetchEventCategory'),
  listCryptoEvents: (params) => ipcRenderer.invoke('api:listCryptoEvents', params),
  fetchSportsMetadata: () => ipcRenderer.invoke('api:fetchSportsMetadata'),
  listSportsEvents: (params) => ipcRenderer.invoke('api:listSportsEvents', params),
  ...marketDataApi,
  ...tradingReadApi,
  placeManualTradingAccountOrder: (input) =>
    ipcRenderer.invoke('trading-account:placeManualOrder', input),
  onPolymarketWalletEvent: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, input: unknown) =>
      callback(input as PolymarketWalletEvent);
    ipcRenderer.on('wallets:event', listener);
    return () => ipcRenderer.removeListener('wallets:event', listener);
  },
  getPolymarketWalletKeyMaterial: (id) => ipcRenderer.invoke('wallets:getKeyMaterial', id),
  createPolymarketWallet: (input) => ipcRenderer.invoke('wallets:create', input),
  createDerivedPolymarketWallet: (input) => ipcRenderer.invoke('wallets:createDerived', input),
  importPolymarketWallet: (input) => ipcRenderer.invoke('wallets:import', input),
  updatePolymarketWallet: (input) => ipcRenderer.invoke('wallets:update', input),
  markPolymarketWalletKeyMaterialBackedUp: (id) =>
    ipcRenderer.invoke('wallets:markKeyMaterialBackedUp', id),
  retryPolymarketWalletInitialization: (id) =>
    ipcRenderer.invoke('wallets:retryInitialization', id),
  setDefaultPolymarketWallet: (id) => ipcRenderer.invoke('wallets:setDefault', id),
  deletePolymarketWallet: (id) => ipcRenderer.invoke('wallets:delete', id),
  listPolymarketBridgeSupportedAssets: () => ipcRenderer.invoke('bridge:listSupportedAssets'),
  createPolymarketBridgeDeposit: (input) => ipcRenderer.invoke('bridge:createDeposit', input),
  quotePolymarketBridgeTransfer: (input) => ipcRenderer.invoke('bridge:quote', input),
  withdrawPolymarketBridge: (input) => ipcRenderer.invoke('bridge:withdraw', input),
  getPolymarketBridgeTransactionStatus: (address) =>
    ipcRenderer.invoke('bridge:getTransactionStatus', address),
  listStrategies: () => ipcRenderer.invoke('strategies:list'),
  getStrategy: (id) => ipcRenderer.invoke('strategies:get', id),
  createStrategy: (input) => ipcRenderer.invoke('strategies:create', input),
  updateStrategy: (input) => ipcRenderer.invoke('strategies:update', input),
  compileStrategySource: (sourceCode) => ipcRenderer.invoke('strategies:compile', sourceCode),
  listStrategyVersions: (strategyId) => ipcRenderer.invoke('strategies:versions', strategyId),
  deleteStrategy: (id) => ipcRenderer.invoke('strategies:delete', id),
  getStrategyDts: () => ipcRenderer.invoke('strategies:dts'),
  getDefaultStrategySource: () => ipcRenderer.invoke('strategies:defaultSource'),
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
  listStrategyRunHistory: (params) => ipcRenderer.invoke('strategy-runs:listHistory', params),
  getStrategyRunLogs: (runId, limit) => ipcRenderer.invoke('strategy-runs:getLogs', runId, limit),
  getStrategyRunOrders: (runId, limit) =>
    ipcRenderer.invoke('strategy-runs:getOrders', runId, limit),
  ...windowApi,
  confirmMainWindowClose: () => ipcRenderer.invoke('main-window:confirm-close'),
  openBotManagement: () => ipcRenderer.invoke('main-window:open-bots'),
  openStrategyEditor: (input) => ipcRenderer.invoke('strategy-editor:open', input),
  onStrategiesChanged: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('strategies:changed', listener);
    return () => ipcRenderer.removeListener('strategies:changed', listener);
  },
  onMainWindowNavigate: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, nav: unknown) => callback(String(nav));
    ipcRenderer.on('main-window:navigate', listener);
    return () => ipcRenderer.removeListener('main-window:navigate', listener);
  },
  onMainWindowCloseRequested: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('main-window:close-requested', listener);
    return () => ipcRenderer.removeListener('main-window:close-requested', listener);
  },
  openTradingWindow: (input) => ipcRenderer.invoke('trading-window:open', input),
  openBrowserWindow: () => ipcRenderer.invoke('browser-window:open'),
  browserNavigate: (url, options) => ipcRenderer.invoke('browser-window:navigate', url, options),
} satisfies Partial<IpcApi>;

exposeApi(mainWindowApi);
