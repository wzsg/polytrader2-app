import { ipcRenderer } from 'electron';
import type { IpcApi, SyncStatus } from '@polytrader/shared';
import { exposeApi, windowApi } from './common.js';

const setupApi = {
  getSetupState: () => ipcRenderer.invoke('setup:getState'),
  chooseSetupDataDirectory: (defaultPath) =>
    ipcRenderer.invoke('setup:chooseDataDirectory', defaultPath),
  startInitialSetup: (input) => ipcRenderer.invoke('setup:startInitialSetup', input),
  completeInitialSetup: () => ipcRenderer.invoke('setup:completeInitialSetup'),
  cancelInitialSetup: () => ipcRenderer.invoke('setup:cancelInitialSetup'),
  onSetupSyncStatus: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, input: unknown) =>
      callback(input as SyncStatus);
    ipcRenderer.on('sync:status', listener);
    return () => ipcRenderer.removeListener('sync:status', listener);
  },
  ...windowApi,
} satisfies Partial<IpcApi>;

exposeApi(setupApi);
