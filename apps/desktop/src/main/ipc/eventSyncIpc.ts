import type { IpcMain } from 'electron';
import type { EventSyncScheduleConfig, EventSyncTrigger } from '@polytrader/shared';
import { polymarketMarketService } from '../services/polymarketMarketService.js';
import { appPreferencesService } from '../services/appPreferencesService.js';
import { setEventListCacheIntervalMinutes } from '../services/eventListCache.js';

interface RegisterEventSyncHandlersOptions {
  initialTrigger: EventSyncTrigger | null;
}

function registerEventSyncHandlers(
  ipcMain: IpcMain,
  options: RegisterEventSyncHandlersOptions,
): void {
  void initializeEventSyncSchedule(options.initialTrigger).catch((error) => {
    console.warn('Failed to apply event sync schedule config', error);
  });
  ipcMain.on('event-sync:start', () => {
    void polymarketMarketService.startEventSync().catch((error) => {
      console.warn('Failed to enqueue event sync', error);
    });
  });

  ipcMain.handle('event-sync:schedule:get', () =>
    polymarketMarketService.readEventSyncScheduleConfig(),
  );

  ipcMain.handle(
    'event-sync:schedule:set',
    async (_event, config: Partial<EventSyncScheduleConfig>) => {
      const next = await polymarketMarketService.writeEventSyncScheduleConfig(config);
      await polymarketMarketService.applyEventSyncScheduleConfig(next, 'manual');
      setEventListCacheIntervalMinutes(next.intervalMinutes);
      return next;
    },
  );
}

async function initializeEventSyncSchedule(initialTrigger: EventSyncTrigger | null): Promise<void> {
  const preferences = await appPreferencesService.getAppPreferences();
  polymarketMarketService.setEventSyncLocale(preferences.locale);
  polymarketMarketService.setEventSyncBatchSize(preferences.eventSyncBatchSize);
  const config = await polymarketMarketService.readEventSyncScheduleConfig();
  setEventListCacheIntervalMinutes(config.intervalMinutes);
  await polymarketMarketService.applyEventSyncScheduleConfig(config, initialTrigger);
}

export { registerEventSyncHandlers };
