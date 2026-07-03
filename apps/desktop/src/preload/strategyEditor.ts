import { ipcRenderer } from 'electron';
import type { IpcApi } from '@polytrader/shared';
import { exposeApi, preferenceApi, windowApi } from './common.js';

const strategyEditorApi = {
  ...preferenceApi,
  listStrategies: () => ipcRenderer.invoke('strategies:list'),
  getStrategy: (id) => ipcRenderer.invoke('strategies:get', id),
  createStrategy: (input) => ipcRenderer.invoke('strategies:create', input),
  updateStrategy: (input) => ipcRenderer.invoke('strategies:update', input),
  compileStrategySource: (sourceCode) => ipcRenderer.invoke('strategies:compile', sourceCode),
  deleteStrategy: (id) => ipcRenderer.invoke('strategies:delete', id),
  getDefaultStrategySource: () => ipcRenderer.invoke('strategies:defaultSource'),
  ...windowApi,
} satisfies Partial<IpcApi>;

exposeApi(strategyEditorApi);
