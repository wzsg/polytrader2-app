import { app, dialog } from 'electron';
import electronUpdater from 'electron-updater';

const { autoUpdater } = electronUpdater;

const UPDATE_CHECK_DELAY_MS = 10_000;
const UPDATE_TOKEN_ENV = 'POLYTRADER_UPDATE_TOKEN';

let updaterInitialized = false;

const updaterLogger = {
  info: (...args: unknown[]) => console.info('[updater]', ...args),
  warn: (...args: unknown[]) => console.warn('[updater]', ...args),
  error: (...args: unknown[]) => console.error('[updater]', ...args),
};

function getUpdateToken(): string {
  return process.env[UPDATE_TOKEN_ENV]?.trim() ?? '';
}

function scheduleUpdateCheck(): void {
  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch((err) => {
      updaterLogger.warn('Failed to check for updates', err);
    });
  }, UPDATE_CHECK_DELAY_MS);
}

export function initAutoUpdater(): void {
  if (updaterInitialized) return;
  updaterInitialized = true;

  if (!app.isPackaged) {
    updaterLogger.info('Development mode: skipped automatic update check');
    return;
  }

  if (process.platform !== 'win32') {
    updaterLogger.info('Automatic update checks are enabled only on Windows');
    return;
  }

  const token = getUpdateToken();
  if (!token) {
    updaterLogger.info(`${UPDATE_TOKEN_ENV} is not set; skipping private GitHub release updates`);
    return;
  }

  autoUpdater.logger = updaterLogger;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.addAuthHeader(`token ${token}`);

  autoUpdater.on('error', (err) => {
    updaterLogger.warn('Automatic update failed', err);
  });

  autoUpdater.on('update-available', (info) => {
    updaterLogger.info(`Found version ${info.version}; downloading in the background`);
  });

  autoUpdater.on('update-not-available', (info) => {
    updaterLogger.info(`Current version is up to date: ${info.version}`);
  });

  autoUpdater.on('update-downloaded', (event) => {
    void dialog
      .showMessageBox({
        type: 'info',
        title: 'Update Downloaded',
        message: `Polytrader2 ${event.version} has been downloaded`,
        detail: 'Restart the app to finish installing the update.',
        buttons: ['Restart and Install', 'Later'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall(false, true);
        }
      })
      .catch((err) => {
        updaterLogger.warn('Failed to show the update prompt', err);
      });
  });

  scheduleUpdateCheck();
}
