import type { IpcMain } from 'electron';
import { getMainWindow } from '../windows/mainWindow.js';
import { systemPerformanceService } from '../services/systemPerformanceService.js';

function registerSystemPerformanceHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('system-performance:get', () => systemPerformanceService.getStatus());
  systemPerformanceService.onStatusChanged((status) => {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('system-performance:changed', status);
  });
}

export { registerSystemPerformanceHandlers };
