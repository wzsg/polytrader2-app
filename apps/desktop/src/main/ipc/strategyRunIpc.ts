import type { IpcMain } from 'electron';
import { strategyRunHistoryService } from '@polytrader/strategy-runtime';
import { wrap } from './result.js';
import { sendStrategyRunEvent } from '../windows/tradingWindow.js';

function registerStrategyRunHandlers(ipcMain: IpcMain): void {
  strategyRunHistoryService.on('runtime-event', (event) => {
    if ('marketId' in event && event.marketId) {
      sendStrategyRunEvent(event.marketId, event);
    }
  });

  ipcMain.handle(
    'strategy-runs:getActiveByMarket',
    wrap((marketId: string) => strategyRunHistoryService.getActiveByMarket(marketId)),
  );
  ipcMain.handle(
    'strategy-runs:listHistory',
    wrap((params) => strategyRunHistoryService.listHistory(params)),
  );
  ipcMain.handle(
    'strategy-runs:getLogs',
    wrap((runId: string, limit?: number) => strategyRunHistoryService.getLogs(runId, limit)),
  );
  ipcMain.handle(
    'strategy-runs:getOrders',
    wrap((runId: string, limit?: number) => strategyRunHistoryService.getOrders(runId, limit)),
  );
}

export { registerStrategyRunHandlers };
