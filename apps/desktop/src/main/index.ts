import { app } from 'electron';
import { join } from 'path';
import { bootstrapApp, stopAppServices } from './app/bootstrap.js';
import { loadLocalEnv } from './env.js';
import { supabaseAuthService } from './services/supabaseAuthService.js';
import { focusMainWindow } from './windows/mainWindow.js';

loadLocalEnv();
app.setName('Polytrader2');
app.setPath('userData', join(app.getPath('appData'), 'polytrader2'));

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
    .then(bootstrapApp)
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
