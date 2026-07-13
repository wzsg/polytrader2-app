import { app, type Event } from 'electron';

type StopAppServices = () => Promise<void>;

class AppLifecycleService {
  private _quitAllowed = false;
  private _quitHandlerRegistered = false;
  private _quitRetryScheduled = false;
  private _shutdownComplete = false;
  private _shutdownPromise: Promise<void> | null = null;
  private _stopAppServices: StopAppServices | null = null;

  public configure(stopAppServices: StopAppServices): void {
    this._stopAppServices = stopAppServices;
  }

  public registerQuitHandler(): void {
    if (this._quitHandlerRegistered) return;
    this._quitHandlerRegistered = true;
    app.on('before-quit', (event) => this._handleBeforeQuit(event));
  }

  public async prepareForShutdown(timeoutMs?: number): Promise<void> {
    if (this._shutdownComplete) return;
    const shutdownPromise = this._getShutdownPromise();
    if (timeoutMs === undefined) {
      await shutdownPromise;
      return;
    }
    await this._waitWithTimeout(shutdownPromise, timeoutMs);
  }

  private _getShutdownPromise(): Promise<void> {
    if (this._shutdownPromise) return this._shutdownPromise;
    if (!this._stopAppServices) {
      return Promise.reject(new Error('App shutdown service has not been configured'));
    }

    this._shutdownPromise = Promise.resolve()
      .then(() => this._stopAppServices?.())
      .then(() => {
        this._shutdownComplete = true;
      })
      .catch((error: unknown) => {
        this._shutdownPromise = null;
        throw error;
      });
    return this._shutdownPromise;
  }

  private _handleBeforeQuit(event: Event): void {
    if (this._quitAllowed || this._shutdownComplete) return;
    event.preventDefault();
    if (this._quitRetryScheduled) return;
    this._quitRetryScheduled = true;

    void this.prepareForShutdown()
      .catch((error: unknown) => {
        console.warn('Failed to stop app services before quitting', error);
      })
      .finally(() => {
        this._quitAllowed = true;
        app.quit();
      });
  }

  private _waitWithTimeout(promise: Promise<void>, timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timed out after ${timeoutMs} ms while stopping app services`));
      }, timeoutMs);

      promise.then(
        () => {
          clearTimeout(timeout);
          resolve();
        },
        (error: unknown) => {
          clearTimeout(timeout);
          reject(error);
        },
      );
    });
  }
}

const appLifecycleService = new AppLifecycleService();

export { appLifecycleService };
