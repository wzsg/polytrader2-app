import { eq } from 'drizzle-orm';
import {
  DEFAULT_LOCALE_PREFERENCE,
  DEFAULT_EVENT_SYNC_BATCH_SIZE,
  DEFAULT_ORDER_CONFIRMATION_THRESHOLD_USD,
  DEFAULT_PERFORMANCE_MONITORING_ENABLED,
  type AppLocalePreference,
} from '@polytrader/shared';
import type { AppPreferenceRecord } from '@polytrader/repository-contract';
import { getDb } from '../client.js';
import { appPreferences } from '../schema/index.js';

const APP_PREFERENCES_ID = 'default';

type AppPreferenceRow = typeof appPreferences.$inferSelect;

class SqlitePreferenceRepository {
  public getAppPreferences(): AppPreferenceRecord | null {
    const row = getDb()
      .select()
      .from(appPreferences)
      .where(eq(appPreferences.id, APP_PREFERENCES_ID))
      .get();
    return row ? this._mapPreference(row) : null;
  }

  public setLocalePreference(
    preference: AppLocalePreference,
    updatedAt: string,
  ): AppPreferenceRecord {
    getDb()
      .insert(appPreferences)
      .values({
        id: APP_PREFERENCES_ID,
        localePreference: preference,
        orderConfirmationThresholdUsd: DEFAULT_ORDER_CONFIRMATION_THRESHOLD_USD,
        eventSyncBatchSize: DEFAULT_EVENT_SYNC_BATCH_SIZE,
        performanceMonitoringEnabled: DEFAULT_PERFORMANCE_MONITORING_ENABLED,
        createdAt: updatedAt,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: appPreferences.id,
        set: {
          localePreference: preference,
          updatedAt,
        },
      })
      .run();
    const record = this.getAppPreferences();
    if (!record) throw new Error('App preferences were not saved');
    return record;
  }

  public setOrderConfirmationThresholdUsd(
    thresholdUsd: number,
    updatedAt: string,
  ): AppPreferenceRecord {
    getDb()
      .insert(appPreferences)
      .values({
        id: APP_PREFERENCES_ID,
        localePreference: DEFAULT_LOCALE_PREFERENCE,
        orderConfirmationThresholdUsd: thresholdUsd,
        eventSyncBatchSize: DEFAULT_EVENT_SYNC_BATCH_SIZE,
        performanceMonitoringEnabled: DEFAULT_PERFORMANCE_MONITORING_ENABLED,
        createdAt: updatedAt,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: appPreferences.id,
        set: {
          orderConfirmationThresholdUsd: thresholdUsd,
          updatedAt,
        },
      })
      .run();
    const record = this.getAppPreferences();
    if (!record) throw new Error('App preferences were not saved');
    return record;
  }

  public setEventSyncBatchSize(batchSize: number, updatedAt: string): AppPreferenceRecord {
    getDb()
      .insert(appPreferences)
      .values({
        id: APP_PREFERENCES_ID,
        localePreference: DEFAULT_LOCALE_PREFERENCE,
        orderConfirmationThresholdUsd: DEFAULT_ORDER_CONFIRMATION_THRESHOLD_USD,
        eventSyncBatchSize: batchSize,
        performanceMonitoringEnabled: DEFAULT_PERFORMANCE_MONITORING_ENABLED,
        createdAt: updatedAt,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: appPreferences.id,
        set: {
          eventSyncBatchSize: batchSize,
          updatedAt,
        },
      })
      .run();
    const record = this.getAppPreferences();
    if (!record) throw new Error('App preferences were not saved');
    return record;
  }

  public setPerformanceMonitoringEnabled(enabled: boolean, updatedAt: string): AppPreferenceRecord {
    getDb()
      .insert(appPreferences)
      .values({
        id: APP_PREFERENCES_ID,
        localePreference: DEFAULT_LOCALE_PREFERENCE,
        orderConfirmationThresholdUsd: DEFAULT_ORDER_CONFIRMATION_THRESHOLD_USD,
        eventSyncBatchSize: DEFAULT_EVENT_SYNC_BATCH_SIZE,
        performanceMonitoringEnabled: enabled,
        createdAt: updatedAt,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: appPreferences.id,
        set: {
          performanceMonitoringEnabled: enabled,
          updatedAt,
        },
      })
      .run();
    const record = this.getAppPreferences();
    if (!record) throw new Error('App preferences were not saved');
    return record;
  }

  private _mapPreference(row: AppPreferenceRow): AppPreferenceRecord {
    return {
      id: row.id,
      localePreference: row.localePreference as AppLocalePreference,
      orderConfirmationThresholdUsd: row.orderConfirmationThresholdUsd,
      eventSyncBatchSize: row.eventSyncBatchSize,
      performanceMonitoringEnabled: row.performanceMonitoringEnabled,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

export { SqlitePreferenceRepository };
