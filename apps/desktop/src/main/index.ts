import { app, dialog, ipcMain } from 'electron';
import { appLifecycleService } from './app/appLifecycleService.js';
import { bootstrapApp, prepareElectronApp, stopAppServices } from './app/bootstrap.js';
import { loadLocalEnv } from './env.js';
import { registerSetupHandlers } from './ipc/setupIpc.js';
import { setupService } from './services/setupService.js';
import { supabaseAuthService } from './services/supabaseAuthService.js';
import { closeSetupWindow, createSetupWindow, focusSetupWindow } from './windows/setupWindow.js';
import {
  closeUnlockWindow,
  createUnlockWindow,
  focusUnlockWindow,
} from './windows/unlockWindow.js';
import { focusMainWindow } from './windows/mainWindow.js';

loadLocalEnv();
app.setName('Polytrader2');

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
} else {
  appLifecycleService.configure(stopAppServices);
  appLifecycleService.registerQuitHandler();

  app.on('second-instance', (_event, argv) => {
    focusMainWindow();
    focusSetupWindow();
    focusUnlockWindow();
    supabaseAuthService.maybeHandleDeepLinkArgv(argv);
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    void supabaseAuthService.handleDeepLinkUrl(url).catch((error) => {
      console.warn('Failed to handle auth deep link', error);
    });
  });

  supabaseAuthService.maybeHandleDeepLinkArgv(process.argv);
  app
    .whenReady()
    .then(startApp)
    .catch((error) => {
      console.error('Failed to bootstrap app', error);
      app.quit();
    });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

async function startApp(): Promise<void> {
  prepareElectronApp();
  registerSetupHandlers(ipcMain, {
    onInitialSetupCompleted: async (dataDirectory) => {
      app.setPath('userData', dataDirectory);
      await bootstrapApp({ initialEventSync: false });
      closeSetupWindow();
    },
    onUnlockCompleted: async (dataDirectory) => {
      app.setPath('userData', dataDirectory);
      await bootstrapApp({ initialEventSync: false });
      closeUnlockWindow();
    },
    onDataDirectoryMigration: async (dataDirectory) => {
      await stopAppServices();
      try {
        await setupService.migrateDataDirectory(dataDirectory);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown data migration error';
        dialog.showErrorBox(
          'Data migration failed',
          `${message}\n\nThe app will restart using the current data directory.`,
        );
      }
      app.relaunch();
      app.exit(0);
    },
  });

  const setupState = await setupService.resolveStartupState();
  if (!setupState.setupCompleted || !setupState.dataDirectory) {
    createSetupWindow();
    return;
  }

  if (setupState.requiresPassword) {
    createUnlockWindow();
    return;
  }

  app.setPath('userData', setupState.dataDirectory);
  await setupService.configureStartupEncryption();
  await bootstrapApp();
}
