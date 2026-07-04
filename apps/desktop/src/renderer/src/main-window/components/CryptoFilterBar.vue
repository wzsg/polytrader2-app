<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { CryptoCategoryConfig, CryptoCategoryItem, Filters } from '@polytrader/shared';
import {
  getAvailableCoins,
  getAvailableModes,
  getAvailableTimeframes,
  getCryptoCategoryLabel,
} from '../../shared/composables/useCryptoCategory';
import { currentLocale } from '../../shared/i18n';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';
import { handleHorizontalWheel } from '../../shared/utils/horizontalScroll';

const props = defineProps<{
  filters: Pick<Filters, 'cryptoCoin' | 'cryptoMarketMode' | 'cryptoTimeframe'>;
  category?: CryptoCategoryConfig | null;
  loading?: boolean;
  error?: string;
}>();

const { t } = useI18n();

const coins = computed(() => getAvailableCoins(props.category ?? null));
const modes = computed(() =>
  getAvailableModes(props.category ?? null, props.filters.cryptoCoin || ''),
);
const timeframes = computed(() =>
  getAvailableTimeframes(
    props.category ?? null,
    props.filters.cryptoCoin || '',
    props.filters.cryptoMarketMode || '',
  ),
);

function selectCoin(coinSlug: string): void {
  if (props.filters.cryptoCoin === coinSlug) return;

  props.filters.cryptoCoin = coinSlug;

  const nextModes = getAvailableModes(props.category ?? null, coinSlug);
  const nextMode = nextModes[0];
  props.filters.cryptoMarketMode = nextMode?.slug || '';

  const nextTimeframes = getAvailableTimeframes(
    props.category ?? null,
    coinSlug,
    props.filters.cryptoMarketMode || '',
  );
  props.filters.cryptoTimeframe = nextTimeframes[0]?.slug || '';
}

function selectMode(modeSlug: string): void {
  if (props.filters.cryptoMarketMode === modeSlug) return;

  props.filters.cryptoMarketMode = modeSlug;

  const nextTimeframes = getAvailableTimeframes(
    props.category ?? null,
    props.filters.cryptoCoin || '',
    modeSlug,
  );
  props.filters.cryptoTimeframe = nextTimeframes[0]?.slug || '';
}

function selectTimeframe(timeframeSlug: string): void {
  props.filters.cryptoTimeframe = timeframeSlug;
}

function coinName(coin: CryptoCategoryItem): string {
  return getCryptoCategoryLabel(coin, currentLocale.value);
}

function coinTitle(coin: CryptoCategoryItem): string {
  const name = getCryptoCategoryLabel(coin, currentLocale.value);
  return coin.symbol ? `${name} ${coin.symbol}` : name;
}

function categoryLabel(item: CryptoCategoryItem): string {
  return getCryptoCategoryLabel(item, currentLocale.value);
}

function coinButtonClass(slug: string): string {
  return props.filters.cryptoCoin === slug
    ? 'border-primary/60 bg-primary/20 text-primary-light'
    : 'border-border bg-btn-secondary text-muted-light hover:bg-btn-secondary-hover hover:text-text';
}

function optionButtonClass(slug: string, selectedSlug: string | undefined): string {
  return selectedSlug === slug
    ? 'border-primary/60 bg-primary/20 text-primary-light'
    : 'border-border bg-bg text-muted-light hover:border-border-light hover:bg-btn-secondary hover:text-text';
}

function hideBrokenIcon(event: Event): void {
  const target = event.target;
  if (target instanceof HTMLImageElement) {
    target.style.display = 'none';
  }
}
</script>

<template>
  <div class="border-border bg-surface flex shrink-0 flex-col gap-3 border-b px-6 py-3.5">
    <template v-if="loading">
      <LoadingSpinner :size="16" :title="t('filter.loadConfig')" />
    </template>

    <template v-else-if="error">
      <span class="text-sm text-red-400">{{ t('filter.loadConfigFailed', { error }) }}</span>
    </template>

    <template v-else-if="category">
      <div class="flex min-w-0 items-center gap-2" :aria-label="t('filter.coinLabel')">
        <span class="text-muted shrink-0 text-[13px]">{{ t('filter.coin') }}</span>
        <div
          class="scrollbar-hidden flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pr-2 whitespace-nowrap"
          @wheel="handleHorizontalWheel"
        >
          <button
            v-for="coin in coins"
            :key="coin.slug"
            type="button"
            class="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border px-2.5 text-sm transition-colors"
            :class="coinButtonClass(coin.slug)"
            :title="coinTitle(coin)"
            :aria-label="coinTitle(coin)"
            :aria-pressed="filters.cryptoCoin === coin.slug"
            @click="selectCoin(coin.slug)"
          >
            <span
              class="bg-bg relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
              aria-hidden="true"
            >
              <span>{{ coin.symbol?.slice(0, 1) || coinName(coin).slice(0, 1) }}</span>
              <img
                v-if="coin.iconUrl"
                :src="coin.iconUrl"
                :alt="coinTitle(coin)"
                class="absolute inset-0 h-5 w-5 rounded-full object-cover"
                @error="hideBrokenIcon"
              />
            </span>
            <span class="font-medium">{{ coin.symbol || coinName(coin) }}</span>
          </button>
        </div>
        <div v-if="$slots.actions" class="ml-auto flex shrink-0 items-center">
          <slot name="actions" />
        </div>
      </div>

      <div class="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
        <div class="flex min-w-0 items-center gap-2" :aria-label="t('filter.modeLabel')">
          <span class="text-muted shrink-0 text-[13px]">{{ t('filter.mode') }}</span>
          <div class="flex min-w-0 flex-wrap items-center gap-1.5">
            <button
              v-for="mode in modes"
              :key="mode.slug"
              type="button"
              class="inline-flex h-8 shrink-0 items-center rounded-md border px-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              :class="optionButtonClass(mode.slug, filters.cryptoMarketMode)"
              :title="categoryLabel(mode)"
              :aria-label="categoryLabel(mode)"
              :aria-pressed="filters.cryptoMarketMode === mode.slug"
              :disabled="!modes.length"
              @click="selectMode(mode.slug)"
            >
              {{ categoryLabel(mode) }}
            </button>
          </div>
        </div>

        <div
          class="flex min-w-0 items-center gap-2"
          :class="{ 'opacity-60': !timeframes.length }"
          :aria-label="t('filter.timeframeLabel')"
        >
          <span class="text-muted shrink-0 text-[13px]">{{ t('filter.timeframe') }}</span>
          <div class="flex min-w-0 flex-wrap items-center gap-1.5">
            <button
              v-for="timeframe in timeframes"
              :key="timeframe.slug"
              type="button"
              class="inline-flex h-8 shrink-0 items-center rounded-md border px-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              :class="optionButtonClass(timeframe.slug, filters.cryptoTimeframe)"
              :title="categoryLabel(timeframe)"
              :aria-label="categoryLabel(timeframe)"
              :aria-pressed="filters.cryptoTimeframe === timeframe.slug"
              :disabled="!timeframes.length"
              @click="selectTimeframe(timeframe.slug)"
            >
              {{ categoryLabel(timeframe) }}
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
