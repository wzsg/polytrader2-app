export const SUPPORTED_LOCALES = ['en-US', 'zh-CN'] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];
export type AppLocalePreference = 'system' | AppLocale;

export interface AppPreferences {
  locale: AppLocale;
  localePreference: AppLocalePreference;
  orderConfirmationThresholdUsd: number;
  eventSyncBatchSize: number;
  performanceMonitoringEnabled: boolean;
  systemLocale: string;
  supportedLocales: readonly AppLocale[];
}

export const DEFAULT_LOCALE: AppLocale = 'en-US';
export const DEFAULT_LOCALE_PREFERENCE: AppLocalePreference = 'system';
export const DEFAULT_ORDER_CONFIRMATION_THRESHOLD_USD = 100;
export const DEFAULT_EVENT_SYNC_BATCH_SIZE = 500;
export const DEFAULT_PERFORMANCE_MONITORING_ENABLED = false;
export const MAX_EVENT_SYNC_BATCH_SIZE = 5_000;

export function normalizeAppLocale(value: unknown): AppLocale | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace('_', '-').toLowerCase();
  if (normalized === 'zh' || normalized.startsWith('zh-')) return 'zh-CN';
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en-US';
  return null;
}

export function normalizeLocalePreference(value: unknown): AppLocalePreference | null {
  if (value === 'system') return 'system';
  return normalizeAppLocale(value);
}

export function resolveLocalePreference(
  preference: AppLocalePreference | null | undefined,
  systemLocale: string,
): AppLocale {
  if (preference && preference !== 'system') return preference;
  return normalizeAppLocale(systemLocale) ?? DEFAULT_LOCALE;
}
