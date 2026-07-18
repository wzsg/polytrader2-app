import { BrowserWindow, type IpcMain } from 'electron';
import type { AppPreferences } from '@polytrader/shared';
import { normalizeLocalePreference } from '@polytrader/shared';
import { supabaseAuthService } from './services/supabaseAuthService.js';
import { appPreferencesService } from './services/appPreferencesService.js';
import { applicationEventBus } from './services/applicationEventBus.js';
import { systemPerformanceService } from './services/systemPerformanceService.js';

async function getAppPreferences(): Promise<AppPreferences> {
  return await appPreferencesService.getAppPreferences();
}

function broadcastPreferences(preferences: AppPreferences): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('preferences:changed', preferences);
    }
  }
}

function registerPreferenceHandlers(ipcMain: IpcMain): void {
  applicationEventBus.subscribe('app-preferences:changed', (event) => {
    broadcastPreferences(event.preferences);
    supabaseAuthService.runDataSyncInBackground();
    if (event.changedKeys.includes('performanceMonitoringEnabled')) {
      void systemPerformanceService.setEnabled(event.preferences.performanceMonitoringEnabled);
    }
  });
  ipcMain.handle('preferences:get', () => getAppPreferences());
  ipcMain.handle('preferences:setLocalePreference', async (_event, input: unknown) => {
    const preference = normalizeLocalePreference(input);
    if (!preference) throw new Error('Unsupported locale preference');
    return await appPreferencesService.setLocalePreference(preference);
  });
  ipcMain.handle('preferences:setOrderConfirmationThresholdUsd', async (_event, input: unknown) => {
    return await appPreferencesService.setOrderConfirmationThresholdUsd(Number(input));
  });
  ipcMain.handle('preferences:setEventSyncBatchSize', async (_event, input: unknown) => {
    return await appPreferencesService.setEventSyncBatchSize(Number(input));
  });
  ipcMain.handle('preferences:setPerformanceMonitoringEnabled', async (_event, input: unknown) => {
    if (typeof input !== 'boolean')
      throw new Error('Performance monitoring setting must be boolean');
    return await appPreferencesService.setPerformanceMonitoringEnabled(input);
  });
}

export { getAppPreferences, registerPreferenceHandlers };
