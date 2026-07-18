import { ipcRenderer } from 'electron';
import type { IpcApi } from '@polytrader/shared';
import { exposeApi, preferenceApi, publicTraderApi, windowApi } from './common.js';

const publicTraderWindowApi = {
  ...preferenceApi,
  ...publicTraderApi,
  ...windowApi,
  openTradingWindow: (input) => ipcRenderer.invoke('trading-window:open', input),
} satisfies Partial<IpcApi>;

exposeApi(publicTraderWindowApi);
