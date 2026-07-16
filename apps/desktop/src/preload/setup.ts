import { ipcRenderer } from 'electron';
import type { EventSyncStatus, IpcApi } from '@polytrader/shared';
import { exposeApi, windowApi } from './common.js';

const setupApi = {
  getSetupState: () => ipcRenderer.invoke('setup:getState'),
  validateSetupDataDirectory: (dataDirectory) =>
    ipcRenderer.invoke('setup:validateDataDirectory', dataDirectory),
  chooseSetupDataDirectory: (defaultPath) =>
    ipcRenderer.invoke('setup:chooseDataDirectory', defaultPath),
  startInitialSetup: (input) => ipcRenderer.invoke('setup:startInitialSetup', input),
  unlockInitialSetup: (password) => ipcRenderer.invoke('setup:unlockInitialSetup', password),
  completeInitialSetup: () => ipcRenderer.invoke('setup:completeInitialSetup'),
  cancelInitialSetup: () => ipcRenderer.invoke('setup:cancelInitialSetup'),
  onSetupEventSyncStatus: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, input: unknown) =>
      callback(input as EventSyncStatus);
    ipcRenderer.on('event-sync:status', listener);
    return () => ipcRenderer.removeListener('event-sync:status', listener);
  },
  ...windowApi,
} satisfies Partial<IpcApi>;

exposeApi(setupApi);
