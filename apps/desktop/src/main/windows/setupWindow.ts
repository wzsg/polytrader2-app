import { BrowserWindow } from 'electron';
import { join } from 'path';
import { getWindowIcon } from './icon.js';

let setupWindow: BrowserWindow | null = null;

function createSetupWindow(): BrowserWindow {
  setupWindow = new BrowserWindow({
    title: 'Polytrader2 Setup',
    icon: getWindowIcon(),
    width: 920,
    height: 640,
    minWidth: 820,
    minHeight: 580,
    frame: false,
    backgroundColor: '#0f0f1a',
    webPreferences: {
      preload: join(__dirname, '../preload/setup.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  setupWindow.on('closed', () => {
    setupWindow = null;
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    setupWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/setup.html`);
  } else {
    setupWindow.loadFile(join(__dirname, '../renderer/setup.html'));
  }

  return setupWindow;
}

function closeSetupWindow(): void {
  if (!setupWindow || setupWindow.isDestroyed()) return;
  setupWindow.close();
  setupWindow = null;
}

export { closeSetupWindow, createSetupWindow };
