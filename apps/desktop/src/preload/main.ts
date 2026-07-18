import { ipcRenderer } from 'electron';
import type { AppUpdateState, IpcApi } from '@polytrader/shared';
import type { StrategyBotRuntimeEvent } from '@polytrader/shared';
import {
  crossChainApi,
  exposeApi,
  marketDataApi,
  orderfilledActivityApi,
  preferenceApi,
  publicTraderApi,
  tradingAccountApi,
  walletApi,
  windowApi,
} from './common.js';

const mainWindowApi = {
  aiAgentIntegrations: {
    detectAll: () => ipcRenderer.invoke('ai-agent-integrations:detect'),
    configure: (agentId, options) =>
      ipcRenderer.invoke('ai-agent-integrations:configure', agentId, options),
    remove: (agentId) => ipcRenderer.invoke('ai-agent-integrations:remove', agentId),
  },
  getAuthState: () => ipcRenderer.invoke('auth:getState'),
  signUpWithEmail: (input) => ipcRenderer.invoke('auth:signUpWithEmail', input),
  signInWithEmail: (input) => ipcRenderer.invoke('auth:signInWithEmail', input),
  signInWithProvider: (provider) => ipcRenderer.invoke('auth:signInWithProvider', provider),
  resendSignupConfirmation: (email) => ipcRenderer.invoke('auth:resendSignupConfirmation', email),
  signOut: () => ipcRenderer.invoke('auth:signOut'),
  runDataSync: () => ipcRenderer.invoke('data-sync:run'),
  getSystemPerformanceStatus: () => ipcRenderer.invoke('system-performance:get'),
  onSystemPerformanceStatusChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, input: unknown) =>
      callback(input as Parameters<typeof callback>[0]);
    ipcRenderer.on('system-performance:changed', listener);
    return () => ipcRenderer.removeListener('system-performance:changed', listener);
  },
  onAuthChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, input: unknown) =>
      callback(input as Parameters<typeof callback>[0]);
    ipcRenderer.on('auth:changed', listener);
    return () => ipcRenderer.removeListener('auth:changed', listener);
  },
  ...preferenceApi,
  getDataStorageDirectory: () => ipcRenderer.invoke('data-storage:getDirectory'),
  chooseDataStorageDirectory: (defaultPath) =>
    ipcRenderer.invoke('data-storage:chooseDirectory', defaultPath),
  migrateDataStorage: (dataDirectory) => ipcRenderer.invoke('data-storage:migrate', dataDirectory),
  startEventSync: () => ipcRenderer.send('event-sync:start'),
  stopEventSync: () => ipcRenderer.invoke('event-sync:stop'),
  onEventSyncStatus: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: unknown) =>
      callback(data as Parameters<typeof callback>[0]);
    ipcRenderer.on('event-sync:status', listener);
    return () => ipcRenderer.removeListener('event-sync:status', listener);
  },
  getEventSyncScheduleConfig: () => ipcRenderer.invoke('event-sync:schedule:get'),
  setEventSyncScheduleConfig: (config) => ipcRenderer.invoke('event-sync:schedule:set', config),
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
  listChildEvents: (request) => ipcRenderer.invoke('db:listChildren', request),
  listEventMarkets: (request) => ipcRenderer.invoke('db:listEventMarkets', request),
  countEvents: (params) => ipcRenderer.invoke('db:count', params),
  getTotalCount: () => ipcRenderer.invoke('db:total'),
  countEventsByTags: (tagIds) => ipcRenderer.invoke('db:countByTags', tagIds),
  countActiveByTags: (tagIds) => ipcRenderer.invoke('db:countActiveByTags', tagIds),
  getEventCacheStats: () => ipcRenderer.invoke('db:eventCacheStats'),
  countActive: () => ipcRenderer.invoke('db:active'),
  getWatchlistEventIds: () => ipcRenderer.invoke('watchlist:list'),
  addToWatchlist: (eventId) => ipcRenderer.invoke('watchlist:add', eventId),
  removeFromWatchlist: (eventId) => ipcRenderer.invoke('watchlist:remove', eventId),
  countWatchlist: () => ipcRenderer.invoke('watchlist:count'),
  countOpenWatchlistEvents: () => ipcRenderer.invoke('watchlist:countOpen'),
  loadFilters: () => ipcRenderer.invoke('filters:load'),
  saveFilters: (data) => ipcRenderer.invoke('filters:save', data),
  fetchEvent: (request) => ipcRenderer.invoke('api:fetchEvent', request),
  fetchCryptoCategory: () => ipcRenderer.invoke('api:fetchCryptoCategory'),
  fetchEventCategory: () => ipcRenderer.invoke('api:fetchEventCategory'),
  fetchSportsCategory: () => ipcRenderer.invoke('api:fetchSportsCategory'),
  onCategoryConfigChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, input: unknown) =>
      callback(input as Parameters<typeof callback>[0]);
    ipcRenderer.on('category-config:changed', listener);
    return () => ipcRenderer.removeListener('category-config:changed', listener);
  },
  listCryptoEvents: (params) => ipcRenderer.invoke('api:listCryptoEvents', params),
  fetchSportsMetadata: () => ipcRenderer.invoke('api:fetchSportsMetadata'),
  listSportsEvents: (params) => ipcRenderer.invoke('api:listSportsEvents', params),
  ...marketDataApi,
  ...orderfilledActivityApi,
  ...publicTraderApi,
  ...tradingAccountApi,
  ...walletApi,
  ...crossChainApi,
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
  getAppUpdateState: () => ipcRenderer.invoke('app-update:get-state'),
  installAppUpdate: () => ipcRenderer.invoke('app-update:install'),
  onAppUpdateStateChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, input: unknown) =>
      callback(input as AppUpdateState);
    ipcRenderer.on('app-update:state-changed', listener);
    return () => ipcRenderer.removeListener('app-update:state-changed', listener);
  },
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
  openPublicTraderWindow: (input) => ipcRenderer.invoke('public-trader:open', input),
  openBrowserWindow: () => ipcRenderer.invoke('browser-window:open'),
  browserNavigate: (url, options) => ipcRenderer.invoke('browser-window:navigate', url, options),
} satisfies Partial<IpcApi>;

exposeApi(mainWindowApi);
