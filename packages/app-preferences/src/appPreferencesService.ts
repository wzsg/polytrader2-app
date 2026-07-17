import type { ApplicationEventBus } from '@polytrader/event-bus';
import type { AppPreferenceRepository } from '@polytrader/repository-contract';
import type { AppLocalePreference, AppPreferences } from '@polytrader/shared';
import {
  DEFAULT_LOCALE_PREFERENCE,
  DEFAULT_EVENT_SYNC_BATCH_SIZE,
  DEFAULT_PERFORMANCE_MONITORING_ENABLED,
  MAX_EVENT_SYNC_BATCH_SIZE,
  DEFAULT_ORDER_CONFIRMATION_THRESHOLD_USD,
  SUPPORTED_LOCALES,
  normalizeLocalePreference,
  resolveLocalePreference,
} from '@polytrader/shared';
import type { AppPreferencesService, AppPreferencesServiceOptions } from './types.js';

const MIN_ORDER_CONFIRMATION_THRESHOLD_USD = 0;
const MAX_ORDER_CONFIRMATION_THRESHOLD_USD = 100_000;

class AppPreferencesServiceImpl implements AppPreferencesService {
  private readonly _repository: AppPreferenceRepository;
  private readonly _eventBus: ApplicationEventBus | null;
  private readonly _getSystemLocale: () => string;

  public constructor(options: AppPreferencesServiceOptions) {
    this._repository = options.repository;
    this._eventBus = options.eventBus ?? null;
    this._getSystemLocale = options.getSystemLocale;
  }

  public async getAppPreferences(): Promise<AppPreferences> {
    const record = await this._repository.getAppPreferences();
    return this._buildPreferences(
      normalizeLocalePreference(record?.localePreference) ?? DEFAULT_LOCALE_PREFERENCE,
      record?.orderConfirmationThresholdUsd,
      record?.eventSyncBatchSize,
      record?.performanceMonitoringEnabled,
    );
  }

  public async setLocalePreference(preference: AppLocalePreference): Promise<AppPreferences> {
    const normalized = normalizeLocalePreference(preference);
    if (!normalized) throw new Error('Unsupported locale preference');

    const previousPreferences = await this.getAppPreferences();
    const record = await this._repository.setLocalePreference(normalized, new Date().toISOString());
    const preferences = this._buildPreferences(
      record.localePreference,
      record.orderConfirmationThresholdUsd,
      record.eventSyncBatchSize,
      record.performanceMonitoringEnabled,
    );
    if (preferences.localePreference !== previousPreferences.localePreference) {
      this._publishPreferencesChanged(preferences, previousPreferences);
    }
    return preferences;
  }

  public async setOrderConfirmationThresholdUsd(thresholdUsd: number): Promise<AppPreferences> {
    const normalized = this._normalizeOrderConfirmationThresholdUsd(thresholdUsd);
    const previousPreferences = await this.getAppPreferences();
    const record = await this._repository.setOrderConfirmationThresholdUsd(
      normalized,
      new Date().toISOString(),
    );
    const preferences = this._buildPreferences(
      record.localePreference,
      record.orderConfirmationThresholdUsd,
      record.eventSyncBatchSize,
      record.performanceMonitoringEnabled,
    );
    if (
      preferences.orderConfirmationThresholdUsd !==
      previousPreferences.orderConfirmationThresholdUsd
    ) {
      this._publishPreferencesChanged(preferences, previousPreferences, [
        'orderConfirmationThresholdUsd',
      ]);
    }
    return preferences;
  }

  public async setEventSyncBatchSize(batchSize: number): Promise<AppPreferences> {
    const normalized = this._normalizeEventSyncBatchSize(batchSize);
    const previousPreferences = await this.getAppPreferences();
    const record = await this._repository.setEventSyncBatchSize(
      normalized,
      new Date().toISOString(),
    );
    const preferences = this._buildPreferences(
      record.localePreference,
      record.orderConfirmationThresholdUsd,
      record.eventSyncBatchSize,
      record.performanceMonitoringEnabled,
    );
    if (preferences.eventSyncBatchSize !== previousPreferences.eventSyncBatchSize) {
      this._publishPreferencesChanged(preferences, previousPreferences, ['eventSyncBatchSize']);
    }
    return preferences;
  }

  public async setPerformanceMonitoringEnabled(enabled: boolean): Promise<AppPreferences> {
    const previousPreferences = await this.getAppPreferences();
    const record = await this._repository.setPerformanceMonitoringEnabled(
      enabled,
      new Date().toISOString(),
    );
    const preferences = this._buildPreferences(
      record.localePreference,
      record.orderConfirmationThresholdUsd,
      record.eventSyncBatchSize,
      record.performanceMonitoringEnabled,
    );
    if (
      preferences.performanceMonitoringEnabled !== previousPreferences.performanceMonitoringEnabled
    ) {
      this._publishPreferencesChanged(preferences, previousPreferences, [
        'performanceMonitoringEnabled',
      ]);
    }
    return preferences;
  }

  private _buildPreferences(
    localePreference: AppLocalePreference,
    orderConfirmationThresholdUsd = DEFAULT_ORDER_CONFIRMATION_THRESHOLD_USD,
    eventSyncBatchSize = DEFAULT_EVENT_SYNC_BATCH_SIZE,
    performanceMonitoringEnabled = DEFAULT_PERFORMANCE_MONITORING_ENABLED,
  ): AppPreferences {
    const systemLocale = this._getSystemLocale() || DEFAULT_LOCALE_PREFERENCE;
    return {
      locale: resolveLocalePreference(localePreference, systemLocale),
      localePreference,
      orderConfirmationThresholdUsd: this._normalizeOrderConfirmationThresholdUsd(
        orderConfirmationThresholdUsd,
      ),
      eventSyncBatchSize: this._normalizeEventSyncBatchSize(eventSyncBatchSize),
      performanceMonitoringEnabled: performanceMonitoringEnabled === true,
      systemLocale,
      supportedLocales: SUPPORTED_LOCALES,
    };
  }

  private _normalizeEventSyncBatchSize(value: unknown): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return DEFAULT_EVENT_SYNC_BATCH_SIZE;
    return Math.max(0, Math.min(MAX_EVENT_SYNC_BATCH_SIZE, Math.trunc(numeric)));
  }

  private _normalizeOrderConfirmationThresholdUsd(value: unknown): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return DEFAULT_ORDER_CONFIRMATION_THRESHOLD_USD;
    const clamped = Math.max(
      MIN_ORDER_CONFIRMATION_THRESHOLD_USD,
      Math.min(MAX_ORDER_CONFIRMATION_THRESHOLD_USD, numeric),
    );
    return Math.round(clamped * 100) / 100;
  }

  private _publishPreferencesChanged(
    preferences: AppPreferences,
    previousPreferences: AppPreferences,
    changedKeys: Array<
      | 'localePreference'
      | 'orderConfirmationThresholdUsd'
      | 'eventSyncBatchSize'
      | 'performanceMonitoringEnabled'
    > = ['localePreference'],
  ): void {
    this._eventBus?.publish('app-preferences:changed', {
      preferences,
      previousPreferences,
      changedKeys,
      at: new Date().toISOString(),
    });
  }
}

export { AppPreferencesServiceImpl };
