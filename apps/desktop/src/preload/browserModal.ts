import { ipcRenderer } from 'electron';
import type { IpcApi } from '@polytrader/shared';
import { exposeApi, windowApi } from './common.js';

const browserModalApi = {
  ...windowApi,
  browserModalGetPayload: () => ipcRenderer.invoke('browser-modal:getPayload'),
  browserModalRespondProviderRequest: (input) =>
    ipcRenderer.invoke('browser-modal:respondProviderRequest', input),
  browserModalDisconnectWallet: () => ipcRenderer.invoke('browser-modal:disconnectWallet'),
  browserModalClose: () => ipcRenderer.invoke('browser-modal:close'),
} satisfies Partial<IpcApi>;

exposeApi(browserModalApi);
