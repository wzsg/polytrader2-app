import { app, autoUpdater as electronAutoUpdater, type IpcMain } from 'electron';
import electronUpdater from 'electron-updater';
import type { AppUpdateState } from '@polytrader/shared';
import { appLifecycleService } from './appLifecycleService.js';
import { getMainWindow, prepareMainWindowForUpdateInstallation } from '../windows/mainWindow.js';

const { autoUpdater } = electronUpdater;

const UPDATE_CHECK_DELAY_MS = 10_000;
const UPDATE_CHECK_INTERVAL_MS = 10 * 60_000;
const UPDATE_SHUTDOWN_TIMEOUT_MS = 30_000;

const updaterLogger = {
  info: (...args: unknown[]) => console.info('[updater]', ...args),
  warn: (...args: unknown[]) => console.warn('[updater]', ...args),
  error: (...args: unknown[]) => console.error('[updater]', ...args),
};

class AutoUpdaterService {
  private _initialized = false;
  private _ipcHandlersRegistered = false;
  private _updateCheckInProgress = false;
  private _updateCheckInterval: ReturnType<typeof setInterval> | null = null;
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

    this._scheduleUpdateChecks();
  }

  public getState(): AppUpdateState {
    return { ...this._state };
  }

  public async installDownloadedUpdate(): Promise<boolean> {
    if (this._state.status !== 'downloaded' || this._installRequested) return false;
    this._installRequested = true;

    try {
      updaterLogger.info('Stopping app services before starting the update installer');
      await appLifecycleService.prepareForShutdown(UPDATE_SHUTDOWN_TIMEOUT_MS);
      updaterLogger.info('App services stopped; starting the update installer');
      autoUpdater.quitAndInstall(false, true);
      return true;
    } catch (err) {
      this._installRequested = false;
      updaterLogger.error('Failed to prepare the app for update installation', err);
      return false;
    }
  }

  private _scheduleUpdateChecks(): void {
    if (this._updateCheckInterval) return;

    setTimeout(() => {
      void this._checkForUpdates();
    }, UPDATE_CHECK_DELAY_MS);

    this._updateCheckInterval = setInterval(() => {
      void this._checkForUpdates();
    }, UPDATE_CHECK_INTERVAL_MS);
  }

  private async _checkForUpdates(): Promise<void> {
    if (!this._canCheckForUpdates()) return;
    this._updateCheckInProgress = true;

    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      updaterLogger.warn('Failed to check for updates', err);
    } finally {
      this._updateCheckInProgress = false;
    }
  }

  private _canCheckForUpdates(): boolean {
    if (this._updateCheckInProgress || this._installRequested) return false;
    return this._state.status !== 'downloading' && this._state.status !== 'downloaded';
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
