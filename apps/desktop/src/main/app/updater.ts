import { app, autoUpdater as electronAutoUpdater, type IpcMain } from 'electron';
import electronUpdater from 'electron-updater';
import type { AppUpdateState } from '@polytrader/shared';
import { getMainWindow, prepareMainWindowForUpdateInstallation } from '../windows/mainWindow.js';

const { autoUpdater } = electronUpdater;

const UPDATE_CHECK_DELAY_MS = 10_000;

const updaterLogger = {
  info: (...args: unknown[]) => console.info('[updater]', ...args),
  warn: (...args: unknown[]) => console.warn('[updater]', ...args),
  error: (...args: unknown[]) => console.error('[updater]', ...args),
};

class AutoUpdaterService {
  private _initialized = false;
  private _ipcHandlersRegistered = false;
  private _installRequested = false;
  private _state: AppUpdateState = { status: 'idle', version: null };

  public registerIpcHandlers(ipcMain: IpcMain): void {
    if (this._ipcHandlersRegistered) return;
    this._ipcHandlersRegistered = true;

    ipcMain.handle('app-update:get-state', () => this.getState());
    ipcMain.handle('app-update:install', () => this.installDownloadedUpdate());
  }

  public initialize(): void {
    if (this._initialized) return;
    this._initialized = true;

    if (!app.isPackaged) {
      updaterLogger.info('Development mode: skipped automatic update check');
      return;
    }

    if (process.platform !== 'win32' && process.platform !== 'darwin') {
      updaterLogger.info('Automatic update checks are enabled only on Windows and macOS');
      return;
    }

    autoUpdater.logger = updaterLogger;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;

    electronAutoUpdater.on('before-quit-for-update', () => {
      prepareMainWindowForUpdateInstallation();
    });

    autoUpdater.on('checking-for-update', () => {
      this._setState({ status: 'checking', version: null });
    });

    autoUpdater.on('error', (err) => {
      this._installRequested = false;
      this._setState({ status: 'error', version: null });
      updaterLogger.warn('Automatic update failed', err);
    });

    autoUpdater.on('update-available', (info) => {
      this._setState({ status: 'downloading', version: info.version });
      updaterLogger.info(`Found version ${info.version}; downloading in the background`);
    });

    autoUpdater.on('update-not-available', (info) => {
      this._setState({ status: 'idle', version: null });
      updaterLogger.info(`Current version is up to date: ${info.version}`);
    });

    autoUpdater.on('update-downloaded', (event) => {
      this._setState({ status: 'downloaded', version: event.version });
      updaterLogger.info(`Version ${event.version} is ready to install`);
    });

    this._scheduleUpdateCheck();
  }

  public getState(): AppUpdateState {
    return { ...this._state };
  }

  public installDownloadedUpdate(): boolean {
    if (this._state.status !== 'downloaded' || this._installRequested) return false;
    this._installRequested = true;

    setImmediate(() => {
      try {
        autoUpdater.quitAndInstall(false, true);
      } catch (err) {
        this._installRequested = false;
        this._setState({ status: 'error', version: null });
        updaterLogger.error('Failed to start the update installer', err);
      }
    });

    return true;
  }

  private _scheduleUpdateCheck(): void {
    setTimeout(() => {
      void autoUpdater.checkForUpdates().catch((err) => {
        updaterLogger.warn('Failed to check for updates', err);
      });
    }, UPDATE_CHECK_DELAY_MS);
  }

  private _setState(state: AppUpdateState): void {
    this._state = state;
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
    mainWindow.webContents.send('app-update:state-changed', this.getState());
  }
}

const autoUpdaterService = new AutoUpdaterService();

export { autoUpdaterService };
