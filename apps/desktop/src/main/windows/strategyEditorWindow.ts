import { BrowserWindow, type IpcMain } from 'electron';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { StrategyEditorWindowInput } from '@polytrader/shared';
import { getWindowIcon } from './icon.js';
import { getWindowChromeOptions } from './windowChrome.js';

const moduleDirname = dirname(fileURLToPath(import.meta.url));

const strategyEditorWindows = new Map<string, BrowserWindow>();
const strategyEditorWindowKeys = new WeakMap<BrowserWindow, string>();

function wireWindowStateEvents(window: BrowserWindow): void {
  window.on('maximize', () => {
    window.webContents.send('window:maximized-changed', true);
  });
  window.on('unmaximize', () => {
    window.webContents.send('window:maximized-changed', false);
  });
}

function normalizeInput(input: StrategyEditorWindowInput): StrategyEditorWindowInput {
  if (input.mode === 'new') return { mode: 'new' };
  const strategyId = input.strategyId?.trim();
  if (!strategyId) throw new Error('strategyId is required to open the strategy editor');
  return { mode: 'edit', strategyId };
}

function getWindowKey(input: StrategyEditorWindowInput): string {
  return input.mode === 'new' ? 'new' : `edit:${input.strategyId}`;
}

function buildSearchParams(input: StrategyEditorWindowInput): URLSearchParams {
  const params = new URLSearchParams();
  params.set('mode', input.mode);
  if (input.mode === 'edit') params.set('strategyId', input.strategyId);
  return params;
}

function buildQuery(input: StrategyEditorWindowInput): Record<string, string> {
  return Object.fromEntries(buildSearchParams(input));
}

function buildDevUrl(input: StrategyEditorWindowInput): string | null {
  if (!process.env.ELECTRON_RENDERER_URL) return null;
  return `${process.env.ELECTRON_RENDERER_URL}/strategy-editor.html?${buildSearchParams(input).toString()}`;
}

function loadStrategyEditorWindow(window: BrowserWindow, input: StrategyEditorWindowInput): void {
  const devUrl = buildDevUrl(input);
  if (devUrl) {
    window.loadURL(devUrl);
    return;
  }

  window.loadFile(join(moduleDirname, '../renderer/strategy-editor.html'), {
    query: buildQuery(input),
  });
}

export function openStrategyEditorWindow(input: StrategyEditorWindowInput): BrowserWindow {
  const normalizedInput = normalizeInput(input);
  const windowKey = getWindowKey(normalizedInput);
  const existingWindow = strategyEditorWindows.get(windowKey);

  if (existingWindow && !existingWindow.isDestroyed()) {
    existingWindow.show();
    existingWindow.focus();
    return existingWindow;
  }

  const strategyEditorWindow = new BrowserWindow({
    title:
      normalizedInput.mode === 'new' ? 'Polytrader2 New Strategy' : 'Polytrader2 Strategy Editor',
    icon: getWindowIcon(),
    width: 1680,
    height: 1050,
    minWidth: 960,
    minHeight: 620,
    ...getWindowChromeOptions(),
    backgroundColor: '#0f0f1a',
    webPreferences: {
      preload: join(moduleDirname, '../preload/strategyEditor.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  wireWindowStateEvents(strategyEditorWindow);
  strategyEditorWindows.set(windowKey, strategyEditorWindow);
  strategyEditorWindowKeys.set(strategyEditorWindow, windowKey);
  strategyEditorWindow.on('closed', () => {
    const key = strategyEditorWindowKeys.get(strategyEditorWindow);
    if (key && strategyEditorWindows.get(key) === strategyEditorWindow) {
      strategyEditorWindows.delete(key);
    }
  });

  loadStrategyEditorWindow(strategyEditorWindow, normalizedInput);
  return strategyEditorWindow;
}

export function closeAllStrategyEditorWindows(): void {
  for (const strategyEditorWindow of strategyEditorWindows.values()) {
    if (!strategyEditorWindow.isDestroyed()) strategyEditorWindow.close();
  }
  strategyEditorWindows.clear();
}

export function registerStrategyEditorWindowHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('strategy-editor:open', (_event, input: StrategyEditorWindowInput) => {
    openStrategyEditorWindow(input);
  });
}
