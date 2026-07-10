import type { IpcMain } from 'electron';
import type { EventSyncTrigger, SyncScheduleConfig } from '@polytrader/shared';
import { polymarketMarketService } from '../services/polymarketMarketService.js';
import { appPreferencesService } from '../services/appPreferencesService.js';

interface RegisterSyncHandlersOptions {
  initialTrigger: EventSyncTrigger | null;
}

function registerSyncHandlers(ipcMain: IpcMain, options: RegisterSyncHandlersOptions): void {
  void initializeEventSyncSchedule(options.initialTrigger).catch((error) => {
    console.warn('Failed to apply sync schedule config', error);
  });
  ipcMain.on('sync:start', () => {
    void polymarketMarketService.startEventSync().catch((error) => {
      console.warn('Failed to enqueue event sync', error);
    });
  });

  ipcMain.handle('sync:schedule:get', () => polymarketMarketService.readSyncScheduleConfig());

  ipcMain.handle('sync:schedule:set', async (_event, config: Partial<SyncScheduleConfig>) => {
    const next = await polymarketMarketService.writeSyncScheduleConfig(config);
    await polymarketMarketService.applySyncScheduleConfig(next, 'manual');
    return next;
  });
}

async function initializeEventSyncSchedule(initialTrigger: EventSyncTrigger | null): Promise<void> {
  const preferences = await appPreferencesService.getAppPreferences();
  polymarketMarketService.setEventSyncLocale(preferences.locale);
  polymarketMarketService.setEventSyncBatchSize(preferences.eventSyncBatchSize);
  await polymarketMarketService.applySyncScheduleConfig(undefined, initialTrigger);
}

export { registerSyncHandlers };
