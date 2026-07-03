import { ipcRenderer } from 'electron';
import type { IpcApi } from '@polytrader/shared';
import { exposeApi, preferenceApi, windowApi } from './common.js';

const browserShellApi = {
  ...preferenceApi,
  ...windowApi,
  browserNavigate: (url, options) => ipcRenderer.invoke('browser-window:navigate', url, options),
  browserGoBack: () => ipcRenderer.invoke('browser-window:back'),
  browserGoForward: () => ipcRenderer.invoke('browser-window:forward'),
  browserReload: () => ipcRenderer.invoke('browser-window:reload'),
  browserStop: () => ipcRenderer.invoke('browser-window:stop'),
  browserGetState: () => ipcRenderer.invoke('browser-window:getState'),
  browserDisconnectWallet: () => ipcRenderer.invoke('browser-window:disconnectWallet'),
  browserOpenConnectionDialog: () => ipcRenderer.invoke('browser-window:openConnectionDialog'),
  browserSetViewBounds: (bounds) => ipcRenderer.invoke('browser-window:setViewBounds', bounds),
  onBrowserNavigationState: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: unknown) =>
      callback(state as Parameters<typeof callback>[0]);
    ipcRenderer.on('browser-window:navigation-state', listener);
    return () => ipcRenderer.removeListener('browser-window:navigation-state', listener);
  },
} satisfies Partial<IpcApi>;

exposeApi(browserShellApi);
