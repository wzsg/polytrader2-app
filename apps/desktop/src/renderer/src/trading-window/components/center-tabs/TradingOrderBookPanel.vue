<script setup lang="ts">
import { computed, watch } from 'vue';
import type { OrderBook, OrderBookLevel } from '@polytrader/shared';
import { useI18n } from 'vue-i18n';
import { formatNumber, formatPriceByTick } from '@/shared/utils/format';

type OrderBookDepthLimit = 10 | 20 | 50 | 'all';

const props = withDefaults(
  defineProps<{
    book: OrderBook;
    live?: boolean;
    depthLimit?: OrderBookDepthLimit;
  }>(),
  { depthLimit: 10 },
);

const emit = defineEmits<{
  'spread-change': [{ tokenId: string; spread: number | null; label: string }];
  'tick-change': [{ tokenId: string; tickSize: string | null }];
}>();

const { t } = useI18n();

function limitDepthLevels(levels: OrderBookLevel[] | undefined): OrderBookLevel[] {
  if (!levels?.length) return [];
  if (props.depthLimit === 'all') return levels;
  return levels.slice(0, props.depthLimit);
}

function enrichDepthLevels(
  levels: OrderBookLevel[] | undefined,
): Array<OrderBookLevel & { cumulative: number; depthPct: number }> {
  if (!levels?.length) return [];

  let cumulative = 0;
  const enriched = levels.map((level) => {
    cumulative += Number(level.size) || 0;
    return { ...level, cumulative };
  });
  const maxCumulative = enriched[enriched.length - 1]?.cumulative || 0;

  return enriched.map((level) => ({
    ...level,
    depthPct: maxCumulative > 0 ? (level.cumulative / maxCumulative) * 100 : 0,
  }));
}

const bestBid = computed(() => props.book.bids?.[0] ?? null);
const bestAsk = computed(() => props.book.asks?.[0] ?? null);
const bidLevels = computed(() => enrichDepthLevels(limitDepthLevels(props.book.bids)));
const askLevels = computed(() => enrichDepthLevels(limitDepthLevels(props.book.asks)));
const spread = computed(() => {
  const bid = Number(bestBid.value?.price);
  const ask = Number(bestAsk.value?.price);
  if (Number.isNaN(bid) || Number.isNaN(ask)) return null;
  return ask - bid;
});

const spreadLabel = computed(() => {
  if (spread.value == null) return '-';
  return formatPriceByTick(spread.value, props.book.tickSize);
});

const lastTradeLabel = computed(() => {
  if (!props.book.lastTradePrice) return '-';
  return formatPriceByTick(props.book.lastTradePrice, props.book.tickSize);
});

watch(
  () => [props.book.tokenId, spread.value, spreadLabel.value] as const,
  ([tokenId, currentSpread, label]) => {
    emit('spread-change', { tokenId, spread: currentSpread, label });
  },
  { immediate: true },
);

watch(
  () => [props.book.tokenId, props.book.tickSize] as const,
  ([tokenId, tickSize]) => {
    emit('tick-change', { tokenId, tickSize: tickSize ?? null });
  },
  { immediate: true },
);
</script>

<template>
  <div class="border-border bg-detail-bg flex min-h-[360px] flex-col overflow-hidden border">
    <div class="border-border shrink-0 border-b px-4 py-3">
      <h3 class="flex items-center gap-2 text-sm font-semibold text-white">
        {{ book.label }}
        <span
          v-if="live"
          class="inline-block h-1.5 w-1.5 rounded-full bg-green-400"
          :title="t('tradingWindow.liveUpdate')"
        />
      </h3>
      <p v-if="book.unavailable" class="text-muted mt-1 text-xs">
        {{ t('tradingWindow.noOrderBook') }}
      </p>
      <template v-else>
        <div class="border-border mt-3 grid grid-cols-2 border sm:grid-cols-4 sm:divide-x">
          <div class="border-border border-b px-3 py-2 sm:border-b-0">
            <p class="text-muted text-[11px]">{{ t('tradingWindow.bestBid') }}</p>
            <p class="mt-0.5 text-sm font-semibold text-green-400 tabular-nums">
              {{ bestBid ? formatPriceByTick(bestBid.price, book.tickSize) : '-' }}
            </p>
            <p v-if="bestBid" class="text-muted text-[11px] tabular-nums">
              {{ formatNumber(bestBid.size, 2) }}
            </p>
          </div>
          <div class="border-border border-b px-3 py-2 sm:border-b-0">
            <p class="text-muted text-[11px]">{{ t('tradingWindow.bestAsk') }}</p>
            <p class="mt-0.5 text-sm font-semibold text-red-400 tabular-nums">
              {{ bestAsk ? formatPriceByTick(bestAsk.price, book.tickSize) : '-' }}
            </p>
            <p v-if="bestAsk" class="text-muted text-[11px] tabular-nums">
              {{ formatNumber(bestAsk.size, 2) }}
            </p>
          </div>
          <div class="border-border px-3 py-2">
            <p class="text-muted text-[11px]">{{ t('common.spread') }}</p>
            <p class="text-text mt-0.5 text-sm font-semibold tabular-nums">{{ spreadLabel }}</p>
          </div>
          <div class="border-border px-3 py-2">
            <p class="text-muted text-[11px]">{{ t('tradingWindow.lastTrade') }}</p>
            <p class="text-primary-light mt-0.5 text-sm font-semibold tabular-nums">
              {{ lastTradeLabel }}
            </p>
          </div>
        </div>
      </template>
    </div>

    <div v-if="!book.unavailable" class="divide-border grid grid-cols-2 divide-x">
      <div class="flex flex-col">
        <div
          class="border-border bg-surface shrink-0 border-b px-4 py-2 text-xs font-semibold text-green-400 uppercase"
        >
          {{ t('tradingWindow.bids') }}
        </div>
        <div>
          <table class="w-full border-collapse">
            <thead class="bg-surface sticky top-0">
              <tr>
                <th class="text-muted px-3 py-2 text-left text-[11px] font-semibold uppercase">
                  {{ t('common.price') }}
                </th>
                <th class="text-muted px-3 py-2 text-right text-[11px] font-semibold uppercase">
                  {{ t('common.quantity') }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(level, index) in bidLevels"
                :key="`bid-${index}`"
                class="border-border/40 relative border-b"
              >
                <td colspan="2" class="relative p-0">
                  <div
                    class="absolute inset-y-0 right-0 bg-green-500/20 transition-[width] duration-200 ease-out"
                    :style="{ width: `${level.depthPct}%` }"
                  />
                  <div class="relative flex items-center">
                    <span class="flex-1 px-3 py-1.5 text-sm text-green-400">
                      {{ formatPriceByTick(level.price, book.tickSize) }}
                    </span>
                    <span class="text-text px-3 py-1.5 text-sm tabular-nums">
                      {{ formatNumber(level.size, 2) }}
                    </span>
                  </div>
                </td>
              </tr>
              <tr v-if="!bidLevels.length">
                <td colspan="2" class="text-muted px-3 py-4 text-center text-xs">
                  {{ t('tradingWindow.noBids') }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="flex flex-col">
        <div
          class="border-border bg-surface shrink-0 border-b px-4 py-2 text-xs font-semibold text-red-400 uppercase"
        >
          {{ t('tradingWindow.asks') }}
        </div>
        <div>
          <table class="w-full border-collapse">
            <thead class="bg-surface sticky top-0">
              <tr>
                <th class="text-muted px-3 py-2 text-left text-[11px] font-semibold uppercase">
                  {{ t('common.price') }}
                </th>
                <th class="text-muted px-3 py-2 text-right text-[11px] font-semibold uppercase">
                  {{ t('common.quantity') }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(level, index) in askLevels"
                :key="`ask-${index}`"
                class="border-border/40 relative border-b"
              >
                <td colspan="2" class="relative p-0">
                  <div
                    class="absolute inset-y-0 left-0 bg-red-500/20 transition-[width] duration-200 ease-out"
                    :style="{ width: `${level.depthPct}%` }"
                  />
                  <div class="relative flex items-center">
                    <span class="flex-1 px-3 py-1.5 text-sm text-red-400">
                      {{ formatPriceByTick(level.price, book.tickSize) }}
                    </span>
                    <span class="text-text px-3 py-1.5 text-sm tabular-nums">
                      {{ formatNumber(level.size, 2) }}
                    </span>
                  </div>
                </td>
              </tr>
              <tr v-if="!askLevels.length">
                <td colspan="2" class="text-muted px-3 py-4 text-center text-xs">
                  {{ t('tradingWindow.noAsks') }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
