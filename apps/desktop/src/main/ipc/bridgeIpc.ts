import { BrowserWindow } from 'electron';
import type { IpcMain } from 'electron';
import type {
  PolymarketBridgeWithdrawalEvent,
  PolymarketBridgeDepositInput,
  PolymarketBridgeQuoteInput,
  PolymarketBridgeWithdrawalInput,
} from '@polytrader/shared';
import { applicationEventBus } from '../services/applicationEventBus.js';
import { polymarketBridgeService } from '../services/polymarketBridgeService.js';
import { wrap } from './result.js';

function registerBridgeHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(
    'bridge:listSupportedAssets',
    wrap(() => polymarketBridgeService.listSupportedAssets()),
  );
  ipcMain.handle(
    'bridge:createDeposit',
    wrap((input: PolymarketBridgeDepositInput) => polymarketBridgeService.createDeposit(input)),
  );
  ipcMain.handle(
    'bridge:quote',
    wrap((input: PolymarketBridgeQuoteInput) => polymarketBridgeService.quoteTransfer(input)),
  );
  ipcMain.handle(
    'bridge:withdraw',
    wrap((input: PolymarketBridgeWithdrawalInput) => polymarketBridgeService.withdraw(input)),
  );
  ipcMain.handle(
    'bridge:getTransactionStatus',
    wrap((address: string) => polymarketBridgeService.getTransactionStatus(address)),
  );
  ipcMain.handle(
    'bridge:listWithdrawals',
    wrap((walletId?: string, limit?: number) =>
      polymarketBridgeService.listWithdrawals(walletId, limit),
    ),
  );
  registerBridgeWithdrawalEventForwarding();
}

let bridgeWithdrawalEventForwardingRegistered = false;

function registerBridgeWithdrawalEventForwarding(): void {
  if (bridgeWithdrawalEventForwardingRegistered) return;
  bridgeWithdrawalEventForwardingRegistered = true;
  applicationEventBus.subscribe('polymarket-withdrawal:created', (event) => {
    sendBridgeWithdrawalEvent({ type: 'created', withdrawal: event.withdrawal });
  });
  applicationEventBus.subscribe('polymarket-withdrawal:updated', (event) => {
    sendBridgeWithdrawalEvent({
      type: 'updated',
      withdrawal: event.withdrawal,
      previousWithdrawal: event.previousWithdrawal,
    });
  });
  applicationEventBus.subscribe('polymarket-withdrawal:succeeded', (event) => {
    sendBridgeWithdrawalEvent({ type: 'succeeded', withdrawal: event.withdrawal });
  });
  applicationEventBus.subscribe('polymarket-withdrawal:failed', (event) => {
    sendBridgeWithdrawalEvent({ type: 'failed', withdrawal: event.withdrawal });
  });
  applicationEventBus.subscribe('polymarket-withdrawal:timed-out', (event) => {
    sendBridgeWithdrawalEvent({ type: 'timed-out', withdrawal: event.withdrawal });
  });
}

function sendBridgeWithdrawalEvent(event: PolymarketBridgeWithdrawalEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('bridge:withdrawal-event', event);
  }
}

export { registerBridgeHandlers };
