import type { AppPreferences } from '@polytrader/shared';

type AppPreferenceChangedKey =
  | 'localePreference'
  | 'orderConfirmationThresholdUsd'
  | 'eventSyncBatchSize'
  | 'performanceMonitoringEnabled';

interface AppPreferencesChangedEvent {
  preferences: AppPreferences;
  previousPreferences: AppPreferences;
  changedKeys: AppPreferenceChangedKey[];
  at: string;
}

type AppPreferenceEventMap = {
  'app-preferences:changed': [event: AppPreferencesChangedEvent];
};

export type { AppPreferenceChangedKey, AppPreferenceEventMap, AppPreferencesChangedEvent };
