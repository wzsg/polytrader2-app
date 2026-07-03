import { BrowserWindow, type IpcMain } from 'electron';
import { DEFAULT_STRATEGY_SOURCE, STRATEGY_CONTEXT_DTS } from '@polytrader/shared';
import { compileStrategySource, strategyCatalogService } from '@polytrader/strategy-runtime';
import { wrap } from './result.js';

function broadcastStrategiesChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('strategies:changed');
  }
}

async function mutateStrategy<T>(handler: () => T | Promise<T>): Promise<T> {
  const result = await handler();
  broadcastStrategiesChanged();
  return result;
}

function registerStrategyTradingHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(
    'strategies:list',
    wrap(() => strategyCatalogService.listStrategies()),
  );
  ipcMain.handle(
    'strategies:get',
    wrap((id: string) => strategyCatalogService.getStrategy(id)),
  );
  ipcMain.handle(
    'strategies:create',
    wrap((input) => mutateStrategy(() => strategyCatalogService.createStrategy(input))),
  );
  ipcMain.handle(
    'strategies:update',
    wrap((input) => mutateStrategy(() => strategyCatalogService.updateStrategy(input))),
  );
  ipcMain.handle('strategies:compile', wrap(compileStrategySource));
  ipcMain.handle(
    'strategies:versions',
    wrap((strategyId: string) => strategyCatalogService.listStrategyVersions(strategyId)),
  );
  ipcMain.handle(
    'strategies:delete',
    wrap((id: string) => mutateStrategy(() => strategyCatalogService.deleteStrategy(id))),
  );
  ipcMain.handle('strategies:dts', () => STRATEGY_CONTEXT_DTS);
  ipcMain.handle('strategies:defaultSource', () => DEFAULT_STRATEGY_SOURCE);
}

export { registerStrategyTradingHandlers };
