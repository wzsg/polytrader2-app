import { BrowserWindow, type IpcMain } from 'electron';
import { join } from 'path';
import type {
  StrategyBotRuntimeEvent,
  StrategyRunRuntimeEvent,
  TradingStrategyStateEvent,
  TradingWindowInput,
} from '@polytrader/shared';
import { getWindowIcon } from './icon.js';

const tradingWindows = new Map<string, BrowserWindow>();
const tradingWindowKeys = new WeakMap<BrowserWindow, string>();
const tradingWindowMarketScopes = new WeakMap<BrowserWindow, Set<string>>();
const tradingWindowCloseConfirmed = new WeakSet<BrowserWindow>();

function wireWindowStateEvents(window: BrowserWindow): void {
  window.on('maximize', () => {
    window.webContents.send('window:maximized-changed', true);
  });
  window.on('unmaximize', () => {
    window.webContents.send('window:maximized-changed', false);
  });
}

function buildTradingQuery(input: TradingWindowInput): Record<string, string> {
  return Object.fromEntries(buildTradingSearchParams(input));
}

function buildTradingSearchParams(input: TradingWindowInput): URLSearchParams {
  const params = new URLSearchParams();
  params.set('marketId', input.marketId);
  params.set('eventId', input.eventId);
  if (input.tokenId) params.set('tokenId', input.tokenId);
  if (input.outcome) params.set('outcome', input.outcome);
  const metadata = serializeTradingMetadata(input.metadata);
  if (metadata) params.set('metadata', metadata);
  return params;
}

function serializeTradingMetadata(metadata: unknown): string {
  if (metadata === undefined) return '';
  try {
    return JSON.stringify(metadata);
  } catch {
    return '';
  }
}

function normalizeTradingMetadata(metadata: unknown): unknown {
  if (metadata === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(metadata));
  } catch {
    return undefined;
  }
}

function buildTradingDevUrl(input: TradingWindowInput): string | null {
  if (process.env.ELECTRON_RENDERER_URL) {
    return `${process.env.ELECTRON_RENDERER_URL}/trading.html?${buildTradingSearchParams(input).toString()}`;
  }
  return null;
}

function loadTradingWindow(window: BrowserWindow, input: TradingWindowInput): void {
  const devUrl = buildTradingDevUrl(input);
  if (devUrl) {
    window.loadURL(devUrl);
    return;
  }

  window.loadFile(join(__dirname, '../renderer/trading.html'), {
    query: buildTradingQuery(input),
  });
}

function sendTradingInput(window: BrowserWindow, input: TradingWindowInput): void {
  if (!window.isDestroyed()) {
    window.webContents.send('trading-window:params', input);
  }
}

function getTradingWindowKey(input: TradingWindowInput): string {
  return `event:${input.eventId.trim()}`;
}

function normalizeTradingWindowInput(input: TradingWindowInput): TradingWindowInput {
  const marketId = input.marketId?.trim();
  const eventId = input.eventId?.trim();
  if (!marketId) {
    throw new Error('marketId is required to open the trading window');
  }
  if (!eventId) {
    throw new Error('eventId is required to open the trading window');
  }
  return {
    ...input,
    marketId,
    eventId,
    metadata: normalizeTradingMetadata(input.metadata),
  };
}

function normalizeMarketIds(marketIds: string[]): string[] {
  return [...new Set(marketIds.map((id) => id.trim()).filter(Boolean))];
}

function setTradingWindowScope(window: BrowserWindow, marketIds: string[]): void {
  tradingWindowMarketScopes.set(window, new Set(normalizeMarketIds(marketIds)));
}

function getTradingWindowScope(window: BrowserWindow): Set<string> {
  return tradingWindowMarketScopes.get(window) ?? new Set();
}

function requestTradingWindowClose(window: BrowserWindow): void {
  if (window.isDestroyed()) return;
  window.show();
  window.focus();
  window.webContents.send('trading-window:close-requested');
}

function getSenderWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender);
}

export function openTradingWindow(input: TradingWindowInput): BrowserWindow {
  const normalizedInput = normalizeTradingWindowInput(input);
  const windowKey = getTradingWindowKey(normalizedInput);
  const existingWindow = tradingWindows.get(windowKey);

  if (existingWindow && !existingWindow.isDestroyed()) {
    existingWindow.show();
    existingWindow.focus();
    setTradingWindowScope(existingWindow, [
      ...getTradingWindowScope(existingWindow),
      normalizedInput.marketId,
    ]);
    sendTradingInput(existingWindow, normalizedInput);
    return existingWindow;
  }

  const tradingWindow = new BrowserWindow({
    title: 'Polytrader2 Trading Window',
    icon: getWindowIcon(),
    width: 1680,
    height: 1050,
    minWidth: 1100,
    minHeight: 680,
    frame: false,
    backgroundColor: '#0f0f1a',
    webPreferences: {
      preload: join(__dirname, '../preload/trading.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  wireWindowStateEvents(tradingWindow);
  tradingWindows.set(windowKey, tradingWindow);
  tradingWindowKeys.set(tradingWindow, windowKey);
  setTradingWindowScope(tradingWindow, [normalizedInput.marketId]);

  tradingWindow.on('close', (event) => {
    if (tradingWindowCloseConfirmed.has(tradingWindow)) return;
    event.preventDefault();
    requestTradingWindowClose(tradingWindow);
  });
  tradingWindow.on('closed', () => {
    const key = tradingWindowKeys.get(tradingWindow);
    if (key && tradingWindows.get(key) === tradingWindow) {
      tradingWindows.delete(key);
    }
  });
  tradingWindow.webContents.once('did-finish-load', () => {
    sendTradingInput(tradingWindow, normalizedInput);
  });

  loadTradingWindow(tradingWindow, normalizedInput);
  return tradingWindow;
}

export function closeAllTradingWindows(): boolean {
  for (const tradingWindow of tradingWindows.values()) {
    if (!tradingWindow.isDestroyed()) {
      tradingWindowCloseConfirmed.add(tradingWindow);
      tradingWindow.close();
    }
  }
  tradingWindows.clear();
  return true;
}

export function sendBotRuntimeEvent(event: StrategyBotRuntimeEvent): void {
  const marketId = 'marketId' in event ? event.marketId : '';
  let delivered = false;
  for (const tradingWindow of tradingWindows.values()) {
    if (tradingWindow.isDestroyed()) continue;
    const scope = getTradingWindowScope(tradingWindow);
    if (marketId && scope.size > 0 && !scope.has(marketId)) continue;
    tradingWindow.webContents.send('bots:event', event);
    delivered = true;
  }

  if (delivered) return;

  for (const tradingWindow of tradingWindows.values()) {
    if (!tradingWindow.isDestroyed()) tradingWindow.webContents.send('bots:event', event);
  }
}

export function sendStrategyRunEvent(marketId: string, event: StrategyRunRuntimeEvent): void {
  let delivered = false;
  for (const tradingWindow of tradingWindows.values()) {
    if (tradingWindow.isDestroyed()) continue;
    const scope = getTradingWindowScope(tradingWindow);
    if (scope.size > 0 && !scope.has(marketId)) continue;
    tradingWindow.webContents.send('strategy-runs:event', event);
    delivered = true;
  }

  if (delivered) return;

  for (const tradingWindow of tradingWindows.values()) {
    if (!tradingWindow.isDestroyed()) tradingWindow.webContents.send('strategy-runs:event', event);
  }
}

export function sendTradingStrategyEvent(marketId: string, event: TradingStrategyStateEvent): void {
  let delivered = false;
  for (const tradingWindow of tradingWindows.values()) {
    if (tradingWindow.isDestroyed()) continue;
    const scope = getTradingWindowScope(tradingWindow);
    if (scope.size > 0 && !scope.has(marketId)) continue;
    tradingWindow.webContents.send('trading-strategy:event', event);
    delivered = true;
  }

  if (delivered) return;

  for (const tradingWindow of tradingWindows.values()) {
    if (!tradingWindow.isDestroyed()) {
      tradingWindow.webContents.send('trading-strategy:event', event);
    }
  }
}

export function registerTradingWindowHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('trading-window:open', (_event, input: TradingWindowInput) => {
    openTradingWindow(input);
  });
  ipcMain.handle('trading-window:update-market-scope', (event, marketIds: string[]) => {
    const tradingWindow = getSenderWindow(event);
    if (!tradingWindow) return;
    setTradingWindowScope(tradingWindow, marketIds);
  });
  ipcMain.handle('trading-window:confirm-close', (event) => {
    const tradingWindow = getSenderWindow(event);
    if (!tradingWindow || tradingWindow.isDestroyed()) return;
    tradingWindowCloseConfirmed.add(tradingWindow);
    tradingWindow.close();
  });
}
