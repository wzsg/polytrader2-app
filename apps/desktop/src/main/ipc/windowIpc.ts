import { BrowserWindow, type IpcMain } from 'electron';
import { confirmMainWindowClose, openBotManagement } from '../windows/mainWindow.js';

function getSenderWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender);
}

export function registerWindowHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('window:minimize', (event) => getSenderWindow(event)?.minimize());
  ipcMain.handle('window:maximize', (event) => {
    const window = getSenderWindow(event);
    if (window?.isMaximized()) {
      window.unmaximize();
    } else {
      window?.maximize();
    }
  });
  ipcMain.handle('window:close', (event) => getSenderWindow(event)?.close());
  ipcMain.handle('main-window:confirm-close', confirmMainWindowClose);
  ipcMain.handle('main-window:open-bots', openBotManagement);
  ipcMain.handle('window:isMaximized', (event) => getSenderWindow(event)?.isMaximized() ?? false);
  ipcMain.handle('window:setAlwaysOnTop', (event, pinned: boolean) => {
    const window = getSenderWindow(event);
    window?.setAlwaysOnTop(pinned);
    return window?.isAlwaysOnTop() ?? false;
  });
  ipcMain.handle('window:isAlwaysOnTop', (event) => {
    return getSenderWindow(event)?.isAlwaysOnTop() ?? false;
  });
}
