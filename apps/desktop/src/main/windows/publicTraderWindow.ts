import { BrowserWindow, type IpcMain } from 'electron';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { PublicTraderWindowInput } from '@polytrader/shared';
import { getWindowIcon } from './icon.js';
import { getWindowChromeOptions } from './windowChrome.js';

const moduleDirname = dirname(fileURLToPath(import.meta.url));
const publicTraderWindows = new Map<string, BrowserWindow>();
const publicTraderWindowKeys = new WeakMap<BrowserWindow, string>();

function normalizeInput(input: PublicTraderWindowInput): PublicTraderWindowInput {
  const address = input.address?.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error('A valid public trader address is required');
  }
  return { address };
}

function buildSearchParams(input: PublicTraderWindowInput): URLSearchParams {
  return new URLSearchParams({ address: input.address });
}

function loadPublicTraderWindow(window: BrowserWindow, input: PublicTraderWindowInput): void {
  const params = buildSearchParams(input);
  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/public-trader.html?${params}`);
    return;
  }
  void window.loadFile(join(moduleDirname, '../renderer/public-trader.html'), {
    query: Object.fromEntries(params),
  });
}

function wireWindowStateEvents(window: BrowserWindow): void {
  window.on('maximize', () => {
    window.webContents.send('window:maximized-changed', true);
  });
  window.on('unmaximize', () => {
    window.webContents.send('window:maximized-changed', false);
  });
}

function getWindowKey(input: PublicTraderWindowInput): string {
  return input.address.toLowerCase();
}

function openPublicTraderWindow(input: PublicTraderWindowInput): BrowserWindow {
  const normalizedInput = normalizeInput(input);
  const key = getWindowKey(normalizedInput);
  const existingWindow = publicTraderWindows.get(key);
  if (existingWindow && !existingWindow.isDestroyed()) {
    existingWindow.show();
    existingWindow.focus();
    return existingWindow;
  }

  const publicTraderWindow = new BrowserWindow({
    title: 'Polytrader2 Trader',
    icon: getWindowIcon(),
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 620,
    ...getWindowChromeOptions(),
    backgroundColor: '#0f0f1a',
    webPreferences: {
      preload: join(moduleDirname, '../preload/publicTrader.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  wireWindowStateEvents(publicTraderWindow);
  publicTraderWindows.set(key, publicTraderWindow);
  publicTraderWindowKeys.set(publicTraderWindow, key);
  publicTraderWindow.on('closed', () => {
    const windowKey = publicTraderWindowKeys.get(publicTraderWindow);
    if (windowKey && publicTraderWindows.get(windowKey) === publicTraderWindow) {
      publicTraderWindows.delete(windowKey);
    }
  });
  loadPublicTraderWindow(publicTraderWindow, normalizedInput);
  return publicTraderWindow;
}

function closeAllPublicTraderWindows(): void {
  for (const publicTraderWindow of publicTraderWindows.values()) {
    if (!publicTraderWindow.isDestroyed()) publicTraderWindow.close();
  }
  publicTraderWindows.clear();
}

function registerPublicTraderWindowHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('public-trader:open', (_event, input: PublicTraderWindowInput) => {
    openPublicTraderWindow(input);
  });
}

export { closeAllPublicTraderWindows, openPublicTraderWindow, registerPublicTraderWindowHandlers };
