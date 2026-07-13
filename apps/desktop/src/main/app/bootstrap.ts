import { app, ipcMain, Menu } from 'electron';
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { closeDb, initDb } from '@polytrader/sqlite-repository';
import {
  MarketPriceHistoryRepositoryFactory,
  MarketTradeRepositoryFactory,
} from '@polytrader/duckdb-repository';
import { autoUpdaterService } from './updater.js';
import { registerAccountHandlers } from '../ipc/walletIpc.js';
import { registerAuthHandlers } from '../ipc/authIpc.js';
import { registerBotHandlers } from '../ipc/botIpc.js';
import { registerBridgeHandlers } from '../ipc/bridgeIpc.js';
import { registerTradingAccountHandlers } from '../ipc/tradingAccountIpc.js';
import { registerDbHandlers } from '../ipc/dbIpc.js';
import { registerDeveloperHandlers } from '../ipc/developerIpc.js';
import { registerMarketHandlers } from '../ipc/marketIpc.js';
import { registerMcpHandlers } from '../ipc/mcpIpc.js';
import { registerStrategyTradingHandlers } from '../ipc/strategyIpc.js';
import { registerStrategyRunHandlers } from '../ipc/strategyRunIpc.js';
import { registerTradingMarketHandlers } from '../ipc/tradingMarketIpc.js';
import { registerTradingStrategyHandlers } from '../ipc/tradingStrategyIpc.js';
import { registerSyncHandlers } from '../ipc/syncIpc.js';
import { registerWindowHandlers } from '../ipc/windowIpc.js';
import { registerPreferenceHandlers } from '../preferences.js';
import {
  polymarketMarketService,
  syncPolymarketMarketServicePreferences,
} from '../services/polymarketMarketService.js';
import { botRuntimeService, strategyRunHistoryService } from '../services/strategyRuntime.js';
import { tradingAccountService } from '../services/tradingAccountService.js';
import { tradingMarketService } from '../services/tradingMarketService.js';
import { tradingStrategyService } from '../services/tradingStrategyService.js';
import { kvStore } from '../services/kvStore.js';
import { supabaseAuthService } from '../services/supabaseAuthService.js';
import { desktopWorkflowService } from '../services/workflowService.js';
import { mcpServerManager } from '../mcp/mcpServerManager.js';
import { createMainWindow } from '../windows/mainWindow.js';
import { registerBrowserWindowHandlers } from '../windows/browserWindow.js';
import { registerStrategyEditorWindowHandlers } from '../windows/strategyEditorWindow.js';
import { registerTradingWindowHandlers } from '../windows/tradingWindow.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
let storageInitialized = false;
let ipcHandlersRegistered = false;
let electronAppPrepared = false;
let appServicesStopping: Promise<void> | null = null;

function resolveMigrationsFolder(): string {
  const bundled = join(__dirname, 'drizzle');
  if (fs.existsSync(bundled)) return bundled;
  return join(app.getAppPath(), 'drizzle');
}

function resolveSqliteWorkerPath(): string {
  return join(__dirname, 'sqliteWorker.js');
}

function registerIpcHandlers(options: { initialEventSync: boolean }): void {
  if (ipcHandlersRegistered) return;
  autoUpdaterService.registerIpcHandlers(ipcMain);
  registerAuthHandlers(ipcMain);
  registerDbHandlers(ipcMain);
  registerDeveloperHandlers(ipcMain);
  registerMarketHandlers(ipcMain);
  registerMcpHandlers(ipcMain);
  registerWindowHandlers(ipcMain);
  registerPreferenceHandlers(ipcMain);
  registerSyncHandlers(ipcMain, {
    initialTrigger: options.initialEventSync ? 'startup' : null,
  });
  registerAccountHandlers(ipcMain);
  registerTradingAccountHandlers(ipcMain);
  registerBotHandlers(ipcMain);
  registerBridgeHandlers(ipcMain);
  registerStrategyTradingHandlers(ipcMain);
  registerStrategyRunHandlers(ipcMain);
  registerTradingMarketHandlers(ipcMain);
  registerTradingStrategyHandlers(ipcMain);
  registerTradingWindowHandlers(ipcMain);
  registerBrowserWindowHandlers(ipcMain);
  registerStrategyEditorWindowHandlers(ipcMain);
  ipcHandlersRegistered = true;
}

function prepareElectronApp(): void {
  if (electronAppPrepared) return;
  app.setName('Polytrader2');
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.polytrader2.app');
  }
  registerAuthProtocol();
  Menu.setApplicationMenu(null);
  electronAppPrepared = true;
}

async function initializeAppStorage(userDataPath?: string): Promise<void> {
  if (storageInitialized) return;
  if (userDataPath) app.setPath('userData', userDataPath);
  const userData = app.getPath('userData');
  await initDb({
    userDataPath: userData,
    migrationsFolder: resolveMigrationsFolder(),
    workerScriptPath: resolveSqliteWorkerPath(),
  });
  await kvStore.initialize(userData);
  MarketTradeRepositoryFactory.getInstance().setMarketTradeStoragePath(userData);
  MarketPriceHistoryRepositoryFactory.getInstance().setMarketPriceHistoryStoragePath(userData);
  desktopWorkflowService.start();
  storageInitialized = true;
}

async function bootstrapApp(options: { initialEventSync?: boolean } = {}): Promise<void> {
  prepareElectronApp();
  await initializeAppStorage();
  await syncPolymarketMarketServicePreferences();
  registerIpcHandlers({ initialEventSync: options.initialEventSync !== false });
  supabaseAuthService.initialize();
  await strategyRunHistoryService.init();
  botRuntimeService.init();
  await mcpServerManager.applySavedConfig();
  createMainWindow();
  autoUpdaterService.initialize();
  tradingAccountService.start();
}

function registerAuthProtocol(): void {
  if (process.defaultApp) {
    app.setAsDefaultProtocolClient('polytrader2', process.execPath, [process.argv[1]]);
    return;
  }
  app.setAsDefaultProtocolClient('polytrader2');
}

function stopAppServices(): Promise<void> {
  if (appServicesStopping) return appServicesStopping;
  appServicesStopping = (async () => {
    await mcpServerManager.stop().catch((error) => {
      console.warn('Failed to stop MCP server manager', error);
    });
    tradingAccountService.stop();
    desktopWorkflowService.stop();
    await botRuntimeService.stopAll().catch((error) => {
      console.warn('Failed to stop bot runtime service', error);
    });
    tradingMarketService.dispose();
    tradingStrategyService.dispose();
    polymarketMarketService.stopAllMarketTradeSync();
    strategyRunHistoryService.stopAll();
    await MarketTradeRepositoryFactory.getInstance()
      .closeMarketTradeRepository()
      .catch((error: unknown) => {
        console.warn('Failed to close market trade repository', error);
      });
    await MarketPriceHistoryRepositoryFactory.getInstance()
      .closeMarketPriceHistoryRepository()
      .catch((error: unknown) => {
        console.warn('Failed to close market price history repository', error);
      });
    await closeDb().catch((error: unknown) => {
      console.warn('Failed to close SQLite DB worker', error);
    });
  })();
  return appServicesStopping;
}

export { bootstrapApp, stopAppServices };
export { initializeAppStorage, prepareElectronApp };
