import type { IpcMain } from 'electron';
import { createSqliteEventRepository } from '@polytrader/sqlite-repository';
import type {
  OrderFilledActivityOpenMarketInput,
  OrderFilledActivityStartInput,
} from '@polytrader/shared';
import { wrap } from './result.js';
import { orderfilledActivityService } from '../services/orderfilledActivityService.js';
import { openTradingWindow } from '../windows/tradingWindow.js';

const eventRepository = createSqliteEventRepository();

function registerOrderfilledActivityHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('orderfilled-activity:get-snapshot', () =>
    orderfilledActivityService.getSnapshot(),
  );
  ipcMain.handle(
    'orderfilled-activity:start',
    wrap((input: OrderFilledActivityStartInput) => orderfilledActivityService.start(input ?? {})),
  );
  ipcMain.handle('orderfilled-activity:stop', () => orderfilledActivityService.stop());
  ipcMain.handle(
    'orderfilled-activity:open-market',
    wrap(async (input: OrderFilledActivityOpenMarketInput) => {
      const conditionId = input.conditionId?.trim();
      if (!conditionId) throw new Error('conditionId is required to open an activity market');

      const market = await eventRepository.getMarketByConditionId(conditionId);
      if (!market?.eventId) throw new Error('Market is not available in the local event cache');

      openTradingWindow({
        marketId: market.id,
        eventId: market.eventId,
        tokenId: input.tokenId?.trim() || null,
        outcome: input.outcome?.trim() || null,
      });
    }),
  );
}

export { registerOrderfilledActivityHandlers };
