import { app, BrowserWindow, dialog, type IpcMain, type OpenDialogOptions } from 'electron';
import type { SetupDirectorySelectionResult } from '@polytrader/shared';
import { setupService } from '../services/setupService.js';
import { applicationEventBus } from '../services/applicationEventBus.js';

interface RegisterSetupHandlersOptions {
  onSetupCompleted: (dataDirectory: string) => Promise<void>;
  onDataDirectoryMigration: (dataDirectory: string) => Promise<void>;
}

let setupHandlersRegistered = false;
let setupStatusSubscriptionRegistered = false;

function registerSetupHandlers(ipcMain: IpcMain, options: RegisterSetupHandlersOptions): void {
  if (setupHandlersRegistered) return;

  ipcMain.handle('setup:getState', () => setupService.getCurrentSetupState());
  ipcMain.handle('setup:validateDataDirectory', (_event, dataDirectory: string) =>
    setupService.validateDataDirectory(dataDirectory),
  );
  ipcMain.handle('data-storage:getDirectory', () => setupService.getDataStorageDirectory());
  ipcMain.handle(
    'data-storage:chooseDirectory',
    async (event, defaultPath?: string): Promise<SetupDirectorySelectionResult> => {
      const window = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      const result = window
        ? await dialog.showOpenDialog(window, {
            title: 'Choose Data Directory',
            defaultPath,
            properties: ['openDirectory', 'createDirectory'],
          })
        : await dialog.showOpenDialog({
            title: 'Choose Data Directory',
            defaultPath,
            properties: ['openDirectory', 'createDirectory'],
          });
      return { canceled: result.canceled, dataDirectory: result.filePaths[0] ?? null };
    },
  );
  ipcMain.handle('data-storage:migrate', async (_event, dataDirectory: string) => {
    const validation = await setupService.validateDataDirectoryMigration(dataDirectory);
    if (!validation.ok) return validation;
    await options.onDataDirectoryMigration(dataDirectory);
    return { ok: true, data: undefined };
  });
  ipcMain.handle(
    'setup:chooseDataDirectory',
    async (event, defaultPath?: string): Promise<SetupDirectorySelectionResult> => {
      const window = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      const options: OpenDialogOptions = {
        title: 'Choose Data Directory',
        defaultPath: defaultPath || setupService.getDefaultDataDirectory(),
        properties: ['openDirectory', 'createDirectory'],
      };
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options);
      if (result.canceled || !result.filePaths[0]) {
        return { canceled: true, dataDirectory: null };
      }
      return { canceled: false, dataDirectory: result.filePaths[0] };
    },
  );
  ipcMain.handle('setup:startInitialSetup', (_event, input) =>
    setupService.startInitialSetup(input),
  );
  ipcMain.handle('setup:unlockInitialSetup', async (_event, password: string) => {
    const result = await setupService.unlockInitialSetup(password);
    if (result.ok && result.data.dataDirectory) {
      await options.onSetupCompleted(result.data.dataDirectory);
    }
    return result;
  });
  ipcMain.handle('setup:completeInitialSetup', async () => {
    const state = await setupService.resolveStartupState();
    if (!state.setupCompleted || !state.dataDirectory) {
      throw new Error('Initial setup is not complete');
    }
    await options.onSetupCompleted(state.dataDirectory);
  });
  ipcMain.handle('setup:cancelInitialSetup', () => {
    app.quit();
  });

  if (!setupStatusSubscriptionRegistered) {
    applicationEventBus.subscribe('polymarket-event-sync:status', (event) => {
      setupService.setLastSyncStatus(event.status);
    });
    setupStatusSubscriptionRegistered = true;
  }

  setupHandlersRegistered = true;
}

export { registerSetupHandlers };
