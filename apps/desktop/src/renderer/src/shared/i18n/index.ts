import type { App } from 'vue';
import { ref } from 'vue';
import { createI18n } from 'vue-i18n';
import {
  DEFAULT_LOCALE,
  DEFAULT_LOCALE_PREFERENCE,
  DEFAULT_EVENT_SYNC_BATCH_SIZE,
  DEFAULT_ORDER_CONFIRMATION_THRESHOLD_USD,
  type AppLocale,
  type AppLocalePreference,
  type AppPreferences,
  normalizeAppLocale,
  resolveLocalePreference,
} from '@polytrader/shared';
import { messages, type MessageSchema } from './messages';
import {
  startAutoTranslate,
  translateDocument,
  translateTerm,
  translateText,
} from './autoTranslate';

export const currentLocale = ref<AppLocale>(DEFAULT_LOCALE);
export const currentLocalePreference = ref<AppLocalePreference>(DEFAULT_LOCALE_PREFERENCE);
export const currentOrderConfirmationThresholdUsd = ref<number>(
  DEFAULT_ORDER_CONFIRMATION_THRESHOLD_USD,
);
export const currentEventSyncBatchSize = ref<number>(DEFAULT_EVENT_SYNC_BATCH_SIZE);
export const currentSystemLocale = ref<string>('');

export const i18n = createI18n<[MessageSchema], AppLocale>({
  legacy: false,
  locale: DEFAULT_LOCALE,
  fallbackLocale: DEFAULT_LOCALE,
  messages,
  datetimeFormats: {
    'en-US': {
      short: { year: 'numeric', month: 'short', day: 'numeric' },
      dateTimeShort: {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      },
    },
    'zh-CN': {
      short: { year: 'numeric', month: 'short', day: 'numeric' },
      dateTimeShort: {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      },
    },
  },
  numberFormats: {
    'en-US': {
      compact: { notation: 'compact', maximumFractionDigits: 1 },
      usd: {
        style: 'currency',
        currency: 'USD',
        currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      },
      decimal: { maximumFractionDigits: 2 },
      percent: { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 },
    },
    'zh-CN': {
      compact: { notation: 'compact', maximumFractionDigits: 1 },
      usd: {
        style: 'currency',
        currency: 'USD',
        currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      },
      decimal: { maximumFractionDigits: 2 },
      percent: { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 },
    },
  },
});

let unsubscribePreferences: (() => void) | null = null;

function setRuntimeLocale(locale: AppLocale): void {
  currentLocale.value = locale;
  const globalScope = i18n.global as unknown as {
    locale: AppLocale | { value: AppLocale };
  };
  if (typeof globalScope.locale === 'object') {
    globalScope.locale.value = locale;
  } else {
    globalScope.locale = locale;
  }
  translateDocument(locale);
}

function applyPreferences(preferences: AppPreferences): void {
  currentLocalePreference.value = preferences.localePreference;
  currentOrderConfirmationThresholdUsd.value = preferences.orderConfirmationThresholdUsd;
  currentEventSyncBatchSize.value = preferences.eventSyncBatchSize;
  currentSystemLocale.value = preferences.systemLocale;
  setRuntimeLocale(preferences.locale);
}

function getBrowserDefaultLocale(): AppLocale {
  const candidates =
    typeof navigator === 'undefined'
      ? []
      : [navigator.language, ...(navigator.languages ? Array.from(navigator.languages) : [])];
  for (const candidate of candidates) {
    const locale = normalizeAppLocale(candidate);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}

export async function initializeI18n(): Promise<void> {
  setRuntimeLocale(getBrowserDefaultLocale());
  try {
    const preferences = await window.api.getAppPreferences();
    applyPreferences(preferences);
    unsubscribePreferences?.();
    unsubscribePreferences = window.api.onPreferencesChanged(applyPreferences);
  } catch {
    const locale = resolveLocalePreference(DEFAULT_LOCALE_PREFERENCE, getBrowserDefaultLocale());
    setRuntimeLocale(locale);
  }
}

export function installI18n(app: App): void {
  app.use(i18n);
}

export function enableAutoTranslate(): void {
  startAutoTranslate(currentLocale.value);
}

export async function setLocalePreference(preference: AppLocalePreference): Promise<void> {
  const preferences = await window.api.setLocalePreference(preference);
  applyPreferences(preferences);
}

export async function setOrderConfirmationThresholdUsd(thresholdUsd: number): Promise<void> {
  const preferences = await window.api.setOrderConfirmationThresholdUsd(thresholdUsd);
  applyPreferences(preferences);
}

export async function setEventSyncBatchSize(batchSize: number): Promise<void> {
  const preferences = await window.api.setEventSyncBatchSize(batchSize);
  applyPreferences(preferences);
}

export function getCurrentLocale(): AppLocale {
  return currentLocale.value;
}

export function getCurrentIntlLocale(): string {
  return currentLocale.value;
}

export function translateUiText(value: string): string {
  return translateText(value, currentLocale.value);
}

export function translateUiKey(key: string, named?: Record<string, unknown>): string {
  const globalScope = i18n.global as unknown as {
    t: (key: string, named?: Record<string, unknown>) => string;
  };
  const translated = globalScope.t(key, named);
  if (translated && translated !== key) return translated;
  return translateTerm(key, currentLocale.value);
}
