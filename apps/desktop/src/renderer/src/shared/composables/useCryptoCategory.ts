import { onScopeDispose, ref } from 'vue';
import type { AppLocale } from '@polytrader/shared';
import type { CryptoCategoryConfig, CryptoCategoryItem } from '@polytrader/shared';
import { currentLocale } from '../i18n';

function sortByOrder(items: CryptoCategoryItem[]): CryptoCategoryItem[] {
  return [...items].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

function enabledItems(items: CryptoCategoryItem[] | undefined): CryptoCategoryItem[] {
  if (!Array.isArray(items)) return [];
  return sortByOrder(items.filter((item) => item.enabled !== false));
}

export function getCryptoCategoryLabel(
  item: CryptoCategoryItem,
  locale: AppLocale = currentLocale.value,
): string {
  const labels = item.labels ?? {};
  if (locale.startsWith('zh')) return labels.zh || labels.en || item.slug;
  return labels.en || labels.zh || item.slug;
}

export function getAvailableCoins(
  config: CryptoCategoryConfig | null | undefined,
): CryptoCategoryItem[] {
  return enabledItems(config?.coins);
}

export function getAvailableModes(
  config: CryptoCategoryConfig | null | undefined,
  coinSlug: string,
): CryptoCategoryItem[] {
  const coin = getAvailableCoins(config).find((c) => c.slug === coinSlug);
  return enabledItems(coin?.marketModes);
}

export function getAvailableTimeframes(
  config: CryptoCategoryConfig | null | undefined,
  coinSlug: string,
  modeSlug: string,
): CryptoCategoryItem[] {
  const mode = getAvailableModes(config, coinSlug).find((m) => m.slug === modeSlug);
  return enabledItems(mode?.timeframes);
}

export function getDefaultSelection(config: CryptoCategoryConfig | null | undefined): {
  coin: string;
  mode: string;
  timeframe: string;
} {
  const coin = getAvailableCoins(config)[0];
  if (!coin) return { coin: '', mode: '', timeframe: '' };

  const mode = getAvailableModes(config, coin.slug)[0];
  if (!mode) return { coin: coin.slug, mode: '', timeframe: '' };

  const timeframe = getAvailableTimeframes(config, coin.slug, mode.slug)[0];
  return {
    coin: coin.slug,
    mode: mode.slug,
    timeframe: timeframe?.slug || '',
  };
}

export function validateSelection(
  config: CryptoCategoryConfig | null | undefined,
  { coin, mode, timeframe }: { coin: string; mode: string; timeframe: string },
): { coin: string; mode: string; timeframe: string } {
  if (!config) return getDefaultSelection(null);

  const coins = getAvailableCoins(config);
  const coinItem = coins.find((c) => c.slug === coin);
  const resolvedCoin = coinItem?.slug || coins[0]?.slug || '';

  const modes = getAvailableModes(config, resolvedCoin);
  const modeItem = modes.find((m) => m.slug === mode);
  const resolvedMode = modeItem?.slug || modes[0]?.slug || '';

  const timeframes = getAvailableTimeframes(config, resolvedCoin, resolvedMode);
  const timeframeItem = timeframes.find((t) => t.slug === timeframe);
  const resolvedTimeframe = timeframeItem?.slug || timeframes[0]?.slug || '';

  return {
    coin: resolvedCoin,
    mode: resolvedMode,
    timeframe: resolvedTimeframe,
  };
}

export function resolveTagIds(
  config: CryptoCategoryConfig | null | undefined,
  coinSlug: string,
  modeSlug: string,
  timeframeSlug: string,
): string[] {
  const timeframe = getAvailableTimeframes(config, coinSlug, modeSlug).find(
    (t) => t.slug === timeframeSlug,
  );
  if (!timeframe?.tagIds?.length) return [];
  return timeframe.tagIds.map((id) => String(id));
}

export function resolveStartTimeMinutes(
  config: CryptoCategoryConfig | null | undefined,
  coinSlug: string,
  modeSlug: string,
  timeframeSlug: string,
): number {
  const timeframe = getAvailableTimeframes(config, coinSlug, modeSlug).find(
    (t) => t.slug === timeframeSlug,
  );
  const minutes = timeframe?.startTimeMinutes;
  return Number.isInteger(minutes) ? minutes! : 0;
}

const TIMEFRAME_DURATION_MINUTES: Record<string, number> = {
  '5m': 5,
  '15m': 15,
  '1h': 60,
  '4h': 4 * 60,
  daily: 24 * 60,
  '1h-above': 60,
  'daily-above': 24 * 60,
  'daily-range': 24 * 60,
  monthly: 30 * 24 * 60,
};

export function resolveTimeframeDurationMinutes(
  config: CryptoCategoryConfig | null | undefined,
  coinSlug: string,
  modeSlug: string,
  timeframeSlug: string,
): number {
  const timeframe = getAvailableTimeframes(config, coinSlug, modeSlug).find(
    (t) => t.slug === timeframeSlug,
  );
  if (!timeframe) return 0;
  return TIMEFRAME_DURATION_MINUTES[timeframe.slug] ?? 0;
}

export function useCryptoCategory() {
  const config = ref<CryptoCategoryConfig | null>(null);
  const loading = ref(false);
  const error = ref('');

  const unsubscribeCategoryConfigChanged = window.api.onCategoryConfigChanged((event) => {
    if (!event.scopes.includes('crypto')) return;
    void loadCategory({ force: true });
  });

  onScopeDispose(() => {
    unsubscribeCategoryConfigChanged();
  });

  async function loadCategory(
    options: { force?: boolean } = {},
  ): Promise<CryptoCategoryConfig | null> {
    if (config.value && !options.force) return config.value;

    loading.value = true;
    error.value = '';
    try {
      config.value = await window.api.fetchCryptoCategory();
      return config.value;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      return null;
    } finally {
      loading.value = false;
    }
  }

  return {
    config,
    loading,
    error,
    loadCategory,
    getAvailableCoins,
    getAvailableModes,
    getAvailableTimeframes,
    getCryptoCategoryLabel,
    getDefaultSelection,
    validateSelection,
    resolveTagIds,
    resolveStartTimeMinutes,
    resolveTimeframeDurationMinutes,
  };
}
