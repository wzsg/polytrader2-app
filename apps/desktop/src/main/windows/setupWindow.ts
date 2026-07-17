import { app, BrowserWindow } from 'electron';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getWindowIcon } from './icon.js';
import { getWindowChromeOptions } from './windowChrome.js';

const moduleDirname = dirname(fileURLToPath(import.meta.url));

let setupWindow: BrowserWindow | null = null;
let setupWindowCloseConfirmed = false;

function createSetupWindow(): BrowserWindow {
  setupWindowCloseConfirmed = false;
  setupWindow = new BrowserWindow({
    title: 'Polytrader2 Setup',
    icon: getWindowIcon(),
    width: 920,
    height: 640,
    minWidth: 820,
    minHeight: 580,
    ...getWindowChromeOptions(),
    backgroundColor: '#0f0f1a',
    webPreferences: {
      preload: join(moduleDirname, '../preload/setup.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  setupWindow.on('close', () => {
    if (setupWindowCloseConfirmed) return;

    setupWindowCloseConfirmed = true;
    app.quit();
  });
  setupWindow.on('closed', () => {
    setupWindow = null;
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    setupWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/setup.html`);
  } else {
    setupWindow.loadFile(join(moduleDirname, '../renderer/setup.html'));
  }

  return setupWindow;
}

function closeSetupWindow(): void {
  if (!setupWindow || setupWindow.isDestroyed()) return;
  setupWindowCloseConfirmed = true;
  setupWindow.close();
  setupWindow = null;
}

function focusSetupWindow(): void {
  if (!setupWindow || setupWindow.isDestroyed()) return;
  if (setupWindow.isMinimized()) setupWindow.restore();
  setupWindow.show();
  setupWindow.focus();
}

export { closeSetupWindow, createSetupWindow, focusSetupWindow };
