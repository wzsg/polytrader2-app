import type { IpcMain } from 'electron';
import { createSqliteEventRepository } from '@polytrader/sqlite-repository';
import type { PublicTraderMarketInput } from '@polytrader/shared';
import { wrap } from './result.js';
import { publicTraderService } from '../services/publicTraderService.js';
import { openTradingWindow } from '../windows/tradingWindow.js';

const eventRepository = createSqliteEventRepository();

function registerPublicTraderHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(
    'public-trader:getLeaderboard',
    wrap((query) => publicTraderService.getLeaderboard(query ?? {})),
  );
  ipcMain.handle(
    'public-trader:getProfile',
    wrap((address: string) => publicTraderService.getProfile(address)),
  );
  ipcMain.handle(
    'public-trader:listPositions',
    wrap((query) => publicTraderService.listPositions(query)),
  );
  ipcMain.handle(
    'public-trader:listTrades',
    wrap((query) => publicTraderService.listTrades(query)),
  );
  ipcMain.handle(
    'public-trader:open-market',
    wrap(async (input: PublicTraderMarketInput) => {
      const conditionId = input.conditionId?.trim();
      if (!conditionId) throw new Error('conditionId is required to open a public trader market');

      const market = await eventRepository.getMarketByConditionId(conditionId);
      if (!market?.eventId) throw new Error('Market is not available in the local event cache');

      openTradingWindow({
        marketId: market.id,
        eventId: market.eventId,
        tokenId: input.asset?.trim() || null,
        outcome: input.outcome?.trim() || null,
      });
    }),
  );
}

export { registerPublicTraderHandlers };
