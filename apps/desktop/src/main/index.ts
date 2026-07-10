import { app, ipcMain } from 'electron';
import { bootstrapApp, prepareElectronApp, stopAppServices } from './app/bootstrap.js';
import { loadLocalEnv } from './env.js';
import { registerSetupHandlers } from './ipc/setupIpc.js';
import { setupService } from './services/setupService.js';
import { supabaseAuthService } from './services/supabaseAuthService.js';
import { closeSetupWindow, createSetupWindow } from './windows/setupWindow.js';
import { focusMainWindow } from './windows/mainWindow.js';

loadLocalEnv();
app.setName('Polytrader2');

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    focusMainWindow();
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

app.on('before-quit', () => {
  stopAppServices();
});

async function startApp(): Promise<void> {
  prepareElectronApp();
  registerSetupHandlers(ipcMain, {
    onSetupCompleted: async (dataDirectory) => {
      app.setPath('userData', dataDirectory);
      await bootstrapApp({ initialEventSync: false });
      closeSetupWindow();
    },
  });

  const setupState = await setupService.resolveStartupState();
  if (!setupState.setupCompleted || !setupState.dataDirectory) {
    createSetupWindow();
    return;
  }

  if (setupState.requiresPassword) {
    createSetupWindow();
    return;
  }

  app.setPath('userData', setupState.dataDirectory);
  await setupService.configureStartupEncryption();
  await bootstrapApp();
}
