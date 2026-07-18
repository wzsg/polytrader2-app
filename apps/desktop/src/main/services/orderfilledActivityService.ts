import { BrowserWindow } from 'electron';
import { OrderFilledActivityServiceImpl } from '@polytrader/orderfilled-activity';
import type {
  AppLocale,
  OrderFilledActivitySnapshot,
  OrderFilledActivityStartInput,
} from '@polytrader/shared';
import { applicationEventBus } from './applicationEventBus.js';
import { appPreferencesService } from './appPreferencesService.js';

class DesktopOrderfilledActivityService {
  private readonly _activityService: OrderFilledActivityServiceImpl;

  public constructor() {
    this._activityService = new OrderFilledActivityServiceImpl();
    this._activityService.on('updated', (snapshot) => this._broadcastSnapshot(snapshot));
    applicationEventBus.subscribe('app-preferences:changed', (event) => {
      if (!event.changedKeys.includes('localePreference')) return;
      if (event.preferences.locale === event.previousPreferences.locale) return;
      void this._restartForLocale(event.preferences.locale);
    });
  }

  public async start(input: OrderFilledActivityStartInput): Promise<OrderFilledActivitySnapshot> {
    const preferences = await appPreferencesService.getAppPreferences();
    return this._activityService.start({ ...input, locale: preferences.locale });
  }

  public getSnapshot(): OrderFilledActivitySnapshot {
    return this._activityService.getSnapshot();
  }

  public stop(): void {
    this._activityService.stop();
  }

  public dispose(): void {
    this._activityService.dispose();
  }

  private async _restartForLocale(locale: AppLocale): Promise<void> {
    const snapshot = this._activityService.getSnapshot();
    if (snapshot.status === 'idle') return;
    await this._activityService.start({
      minTradeAmount: snapshot.subscription.minTradeAmount,
      minTradeVolume: snapshot.subscription.minTradeVolume,
      locale,
    });
  }

  private _broadcastSnapshot(snapshot: OrderFilledActivitySnapshot): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed() || window.webContents.isDestroyed()) continue;
      window.webContents.send('orderfilled-activity:updated', snapshot);
    }
  }
}

const orderfilledActivityService = new DesktopOrderfilledActivityService();

export { orderfilledActivityService };
