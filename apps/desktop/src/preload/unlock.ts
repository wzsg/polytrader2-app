import { ipcRenderer } from 'electron';
import type { IpcApi } from '@polytrader/shared';
import { exposeApi } from './common.js';

const unlockWindowApi: Pick<
  IpcApi,
  | 'windowMinimize'
  | 'windowMaximize'
  | 'windowClose'
  | 'windowIsMaximized'
  | 'onWindowMaximizedChanged'
> = {
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),
  windowIsMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onWindowMaximizedChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, maximized: boolean) => callback(maximized);
    ipcRenderer.on('window:maximized-changed', listener);
    return () => ipcRenderer.removeListener('window:maximized-changed', listener);
  },
};

const unlockApi = {
  getSetupState: () => ipcRenderer.invoke('setup:getState'),
  unlockInitialSetup: (password) => ipcRenderer.invoke('setup:unlockInitialSetup', password),
  cancelInitialSetup: () => ipcRenderer.invoke('setup:cancelInitialSetup'),
  ...unlockWindowApi,
} satisfies Partial<IpcApi>;

exposeApi(unlockApi);
