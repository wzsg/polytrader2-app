import { BrowserWindow, dialog, type IpcMain, type OpenDialogOptions } from 'electron';
import type { SetupDirectorySelectionResult } from '@polytrader/shared';
import { setupService } from '../services/setupService.js';
import { applicationEventBus } from '../services/applicationEventBus.js';

interface RegisterSetupHandlersOptions {
  onSetupCompleted: (dataDirectory: string) => Promise<void>;
}

let setupHandlersRegistered = false;
let setupStatusSubscriptionRegistered = false;

function registerSetupHandlers(ipcMain: IpcMain, options: RegisterSetupHandlersOptions): void {
  if (setupHandlersRegistered) return;

  ipcMain.handle('setup:getState', () => setupService.getCurrentSetupState());
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
  ipcMain.handle('setup:startInitialSetup', async (_event, input: { dataDirectory: string }) => {
    const result = await setupService.startInitialSetup(input);
    if (result.ok && result.data.dataDirectory) {
      await options.onSetupCompleted(result.data.dataDirectory);
    }
    return result;
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
