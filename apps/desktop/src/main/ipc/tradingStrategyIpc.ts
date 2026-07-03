import type { IpcMain } from 'electron';
import type { TradingStrategyStateEvent } from '@polytrader/shared';
import { wrap } from './result.js';
import { tradingStrategyService } from '../services/tradingStrategyService.js';
import { sendTradingStrategyEvent } from '../windows/tradingWindow.js';

function registerTradingStrategyHandlers(ipcMain: IpcMain): void {
  tradingStrategyService.onEvent((event: TradingStrategyStateEvent) => {
    sendTradingStrategyEvent(event.marketId, event);
  });

  ipcMain.handle(
    'trading-strategy:getState',
    wrap((marketId: string) => tradingStrategyService.getState(marketId)),
  );
  ipcMain.handle(
    'trading-strategy:selectRun',
    wrap((marketId: string, runId: string) => tradingStrategyService.selectRun(marketId, runId)),
  );
  ipcMain.handle(
    'trading-strategy:getActiveRun',
    wrap((marketId: string) => tradingStrategyService.getActiveRun(marketId)),
  );
}

export { registerTradingStrategyHandlers };
