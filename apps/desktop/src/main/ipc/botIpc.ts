import type { IpcMain } from 'electron';
import type { StrategyBotCreateInput, StrategyBotUpdateInput } from '@polytrader/shared';
import { wrap } from './result.js';
import { getMainWindow } from '../windows/mainWindow.js';
import { sendBotRuntimeEvent } from '../windows/tradingWindow.js';
import { botRuntimeService } from '../services/strategyRuntime.js';

function registerBotHandlers(ipcMain: IpcMain): void {
  botRuntimeService.on('runtime-event', (event) => {
    getMainWindow()?.webContents.send('bots:event', event);
    if ('marketId' in event && event.marketId) sendBotRuntimeEvent(event);
  });

  ipcMain.handle(
    'bots:list',
    wrap((params) => botRuntimeService.listBots(params)),
  );
  ipcMain.handle(
    'bots:create',
    wrap((input: StrategyBotCreateInput) => botRuntimeService.createBot(input)),
  );
  ipcMain.handle(
    'bots:update',
    wrap((input: StrategyBotUpdateInput) => botRuntimeService.updateBot(input)),
  );
  ipcMain.handle(
    'bots:delete',
    wrap((id: string) => botRuntimeService.deleteBot(id)),
  );
  ipcMain.handle(
    'bots:start',
    wrap((id: string) => botRuntimeService.startBot(id)),
  );
  ipcMain.handle(
    'bots:stop',
    wrap((id: string) => botRuntimeService.stopBot(id)),
  );
  ipcMain.handle(
    'bots:getActiveRun',
    wrap((id: string) => botRuntimeService.getActiveRun(id)),
  );
  ipcMain.handle(
    'bots:listRuns',
    wrap((botId: string, limit?: number) => botRuntimeService.listRuns(botId, limit)),
  );
  ipcMain.handle(
    'bots:getLogs',
    wrap((runId: string, limit?: number) => botRuntimeService.getLogs(runId, limit)),
  );
  ipcMain.handle(
    'bots:getOrders',
    wrap((runId: string, limit?: number) => botRuntimeService.getOrders(runId, limit)),
  );
}

export { registerBotHandlers };
