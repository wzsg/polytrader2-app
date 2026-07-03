import type { IpcMain } from 'electron';
import type {
  PolymarketBridgeDepositInput,
  PolymarketBridgeQuoteInput,
  PolymarketBridgeWithdrawalInput,
} from '@polytrader/shared';
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
}

export { registerBridgeHandlers };
