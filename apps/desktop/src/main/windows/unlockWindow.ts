import { app, BrowserWindow } from 'electron';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getWindowIcon } from './icon.js';
import { getWindowChromeOptions } from './windowChrome.js';

const moduleDirname = dirname(fileURLToPath(import.meta.url));

let unlockWindow: BrowserWindow | null = null;
let unlockWindowCloseConfirmed = false;

function createUnlockWindow(): BrowserWindow {
  unlockWindowCloseConfirmed = false;
  unlockWindow = new BrowserWindow({
    title: 'Unlock Polytrader2',
    icon: getWindowIcon(),
    width: 460,
    height: 340,
    minWidth: 420,
    minHeight: 320,
    resizable: false,
    ...getWindowChromeOptions(),
    backgroundColor: '#0f0f1a',
    webPreferences: {
      preload: join(moduleDirname, '../preload/unlock.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  unlockWindow.on('close', () => {
    if (unlockWindowCloseConfirmed) return;
    unlockWindowCloseConfirmed = true;
    app.quit();
  });
  unlockWindow.on('closed', () => {
    unlockWindow = null;
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    unlockWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/unlock.html`);
  } else {
    unlockWindow.loadFile(join(moduleDirname, '../renderer/unlock.html'));
  }

  return unlockWindow;
}

function closeUnlockWindow(): void {
  if (!unlockWindow || unlockWindow.isDestroyed()) return;
  unlockWindowCloseConfirmed = true;
  unlockWindow.close();
  unlockWindow = null;
}

function focusUnlockWindow(): void {
  if (!unlockWindow || unlockWindow.isDestroyed()) return;
  if (unlockWindow.isMinimized()) unlockWindow.restore();
  unlockWindow.show();
  unlockWindow.focus();
}

export { closeUnlockWindow, createUnlockWindow, focusUnlockWindow };
