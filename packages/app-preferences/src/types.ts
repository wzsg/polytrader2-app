import type { ApplicationEventBus } from '@polytrader/event-bus';
import type { AppPreferenceRepository } from '@polytrader/repository-contract';
import type { AppLocalePreference, AppPreferences } from '@polytrader/shared';

interface AppPreferencesService {
  getAppPreferences(): Promise<AppPreferences>;
  setLocalePreference(preference: AppLocalePreference): Promise<AppPreferences>;
  setOrderConfirmationThresholdUsd(thresholdUsd: number): Promise<AppPreferences>;
  setEventSyncBatchSize(batchSize: number): Promise<AppPreferences>;
}

interface AppPreferencesServiceOptions {
  repository: AppPreferenceRepository;
  eventBus?: ApplicationEventBus;
  getSystemLocale: () => string;
}

export type { AppPreferencesService, AppPreferencesServiceOptions };
