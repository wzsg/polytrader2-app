import { BrowserWindow } from 'electron';
import type { IpcMain } from 'electron';
import type {
  PolymarketWalletCreateInput,
  PolymarketWalletDerivedInput,
  PolymarketWalletImportInput,
  PolymarketWalletUpdateInput,
} from '@polytrader/shared';
import type { PolymarketWalletEvent } from '@polytrader/shared';
import { applicationEventBus } from '../services/applicationEventBus.js';
import { polymarketWalletService } from '../services/polymarketWalletService.js';
import { wrap } from './result.js';

function registerAccountHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(
    'wallets:list',
    wrap(() => polymarketWalletService.listPolymarketWallets()),
  );
  ipcMain.handle(
    'wallets:getKeyMaterial',
    wrap((id: string) => polymarketWalletService.getPolymarketWalletKeyMaterial(id)),
  );
  ipcMain.handle(
    'wallets:create',
    wrap((input: PolymarketWalletCreateInput) =>
      polymarketWalletService.createPolymarketWallet(input),
    ),
  );
  ipcMain.handle(
    'wallets:createDerived',
    wrap((input: PolymarketWalletDerivedInput) =>
      polymarketWalletService.createDerivedPolymarketWallet(input),
    ),
  );
  ipcMain.handle(
    'wallets:import',
    wrap((input: PolymarketWalletImportInput) =>
      polymarketWalletService.importPolymarketWallet(input),
    ),
  );
  ipcMain.handle(
    'wallets:update',
    wrap((input: PolymarketWalletUpdateInput) =>
      polymarketWalletService.updatePolymarketWallet(input),
    ),
  );
  ipcMain.handle(
    'wallets:markKeyMaterialBackedUp',
    wrap((id: string) => polymarketWalletService.markPolymarketWalletKeyMaterialBackedUp(id)),
  );
  ipcMain.handle(
    'wallets:retryInitialization',
    wrap((id: string) => polymarketWalletService.retryPolymarketWalletInitialization(id)),
  );
  ipcMain.handle(
    'wallets:setDefault',
    wrap((id: string) => polymarketWalletService.setDefaultPolymarketWallet(id)),
  );
  ipcMain.handle(
    'wallets:delete',
    wrap((id: string) => polymarketWalletService.deletePolymarketWallet(id)),
  );
  registerWalletEventForwarding();
}

let walletEventForwardingRegistered = false;

function registerWalletEventForwarding(): void {
  if (walletEventForwardingRegistered) return;
  walletEventForwardingRegistered = true;
  applicationEventBus.subscribe('polymarket-wallet:created', (event) => {
    sendWalletEvent({ type: 'created', wallet: event.wallet });
  });
  applicationEventBus.subscribe('polymarket-wallet:updated', (event) => {
    sendWalletEvent({
      type: 'updated',
      wallet: event.wallet,
      previousWallet: event.previousWallet,
    });
  });
  applicationEventBus.subscribe('polymarket-wallet:deleted', (event) => {
    sendWalletEvent({ type: 'deleted', wallet: event.wallet });
  });
  applicationEventBus.subscribe('polymarket-wallet:default-changed', (event) => {
    sendWalletEvent({
      type: 'default-changed',
      wallet: event.wallet,
      previousDefaultWalletId: event.previousDefaultWalletId,
    });
  });
}

function sendWalletEvent(event: PolymarketWalletEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('wallets:event', event);
  }
}

export { registerAccountHandlers };
