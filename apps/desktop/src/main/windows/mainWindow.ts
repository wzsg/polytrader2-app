import { app, BrowserWindow } from 'electron';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { closeBrowserWindow } from './browserWindow.js';
import { getWindowIcon } from './icon.js';
import { closeAllStrategyEditorWindows } from './strategyEditorWindow.js';
import { closeAllTradingWindows } from './tradingWindow.js';
import { getWindowChromeOptions } from './windowChrome.js';

const moduleDirname = dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let mainWindowCloseConfirmed = false;

function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

function focusMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();

  if (process.platform === 'darwin') {
    app.focus({ steal: true });
  }
}

function confirmMainWindowClose(): void {
  if (!mainWindow || mainWindowCloseConfirmed) return;

  mainWindowCloseConfirmed = true;
  if (!closeAllTradingWindows()) {
    mainWindowCloseConfirmed = false;
    return;
  }
  closeAllStrategyEditorWindows();
  closeBrowserWindow();
  mainWindow.close();
}

function prepareMainWindowForUpdateInstallation(): void {
  mainWindowCloseConfirmed = true;
  closeAllTradingWindows();
  closeAllStrategyEditorWindows();
  closeBrowserWindow();
}

function openBotManagement(): void {
  if (!__STRATEGY_AUTOMATION_ENABLED__) return;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  focusMainWindow();
  mainWindow.webContents.send('main-window:navigate', 'bots');
}

function wireWindowStateEvents(window: BrowserWindow): void {
  window.on('maximize', () => {
    window.webContents.send('window:maximized-changed', true);
  });
  window.on('unmaximize', () => {
    window.webContents.send('window:maximized-changed', false);
  });
}

function createMainWindow(): BrowserWindow {
  mainWindowCloseConfirmed = false;
  mainWindow = new BrowserWindow({
    title: 'Polytrader2',
    icon: getWindowIcon(),
    width: 1680,
    height: 1050,
    ...getWindowChromeOptions(),
    backgroundColor: '#0f0f1a',
    webPreferences: {
      preload: join(moduleDirname, '../preload/main.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  wireWindowStateEvents(mainWindow);
  mainWindow.on('close', (event) => {
    if (mainWindowCloseConfirmed || !mainWindow) return;

    event.preventDefault();
    mainWindow.webContents.send('main-window:close-requested');
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(moduleDirname, '../renderer/index.html'));
  }

  return mainWindow;
}

export {
  confirmMainWindowClose,
  createMainWindow,
  focusMainWindow,
  getMainWindow,
  openBotManagement,
  prepareMainWindowForUpdateInstallation,
};
