<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { ArrowDown, ArrowUp, RotateCcw } from '@lucide/vue';
import type {
  MarketOutcome,
  MarketTradeListResult,
  MarketTradeSortField,
  MarketTradeSyncStatus,
  MarketTradeTick,
  SortOrder,
  TradingMarketEvent,
} from '@polytrader/shared';
import {
  formatNumber,
  formatPrice,
  formatTimestamp,
  sideClass,
  sideLabel,
} from '@/shared/utils/format';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';
import { useI18n } from 'vue-i18n';

const PAGE_SIZE = 200;

const props = defineProps<{
  marketId: string;
  conditionId: string;
  outcomes: MarketOutcome[];
  defaultResult: MarketTradeListResult | null;
  defaultSyncStatus: MarketTradeSyncStatus | null;
  embedded?: boolean;
}>();

const emit = defineEmits<{
  'total-change': [total: number];
}>();

const { t } = useI18n();

const items = ref<MarketTradeTick[]>([]);
const total = ref(0);
const hasMore = ref(false);
const loading = ref(false);
const loadingMore = ref(false);
const error = ref('');
const syncStatus = ref<MarketTradeSyncStatus | null>(null);
const outcomeFilter = ref('');
const sideFilter = ref('');
const priceMin = ref('');
const priceMax = ref('');
const sizeMin = ref('');
const sizeMax = ref('');
const timeFrom = ref('');
const timeTo = ref('');
const sortField = ref<MarketTradeSortField>('time');
const sortOrder = ref<SortOrder>('desc');

let requestSeq = 0;
let unsubscribeUpdates: (() => void) | null = null;
let filterTimer: ReturnType<typeof setTimeout> | null = null;

const colspan = 5;
const countLabel = computed(() => t('count.items', { count: total.value }));
const initialLoading = computed(() => loading.value && items.value.length === 0);
const hasActiveQuery = computed(
  () =>
    Boolean(
      outcomeFilter.value ||
      sideFilter.value ||
      priceMin.value ||
      priceMax.value ||
      sizeMin.value ||
      sizeMax.value ||
      timeFrom.value ||
      timeTo.value,
    ) ||
    sortField.value !== 'time' ||
    sortOrder.value !== 'desc',
);

function buildQuery(offset: number, limit = PAGE_SIZE) {
  return {
    marketId: props.marketId,
    conditionId: props.conditionId,
    outcome: outcomeFilter.value || undefined,
    side: sideFilter.value || undefined,
    priceMin: priceMin.value || undefined,
    priceMax: priceMax.value || undefined,
    sizeMin: sizeMin.value || undefined,
    sizeMax: sizeMax.value || undefined,
    timeFrom: timeFrom.value || undefined,
    timeTo: timeTo.value || undefined,
    sortField: sortField.value,
    sortOrder: sortOrder.value,
    limit,
    offset,
  };
}

function applyDefaultResult(): void {
  if (hasActiveQuery.value) return;
  const result = props.defaultResult;
  syncStatus.value = props.defaultSyncStatus ?? result?.syncStatus ?? null;
  items.value = result?.items ?? [];
  total.value = result?.total ?? 0;
  hasMore.value = result?.hasMore ?? false;
  error.value = result?.error ?? '';
  loading.value = false;
  loadingMore.value = false;
  emit('total-change', total.value);
}

async function loadPage(offset: number, options: { append?: boolean; silent?: boolean } = {}) {
  const append = options.append === true;
  const silent = options.silent === true;
  const seq = ++requestSeq;

  if (!props.conditionId) {
    items.value = [];
    total.value = 0;
    hasMore.value = false;
    emit('total-change', 0);
    return;
  }

  error.value = '';
  if (!silent) {
    if (append) loadingMore.value = true;
    else loading.value = true;
  }

  try {
    const result = await window.api.tradingMarket.listTrades(props.marketId, buildQuery(offset));
    if (seq !== requestSeq) return;

    if (!result.ok) {
      error.value = result.error;
      if (!append) items.value = [];
      return;
    }

    syncStatus.value = result.data.syncStatus;
    total.value = result.data.total;
    hasMore.value = result.data.hasMore;
    items.value = append ? [...items.value, ...result.data.items] : result.data.items;
    emit('total-change', result.data.total);
    if (result.data.error) error.value = result.data.error;
  } finally {
    if (seq === requestSeq && !silent) {
      loading.value = false;
      loadingMore.value = false;
    }
  }
}

function scheduleReload(): void {
  if (filterTimer) clearTimeout(filterTimer);
  filterTimer = setTimeout(() => {
    filterTimer = null;
    void loadPage(0);
  }, 180);
}

function loadMore(): void {
  if (loading.value || loadingMore.value || !hasMore.value) return;
  void loadPage(items.value.length, { append: true });
}

function handleScroll(event: Event): void {
  const el = event.currentTarget as HTMLElement;
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 96) loadMore();
}

function toggleSort(field: MarketTradeSortField): void {
  if (sortField.value === field) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortField.value = field;
    sortOrder.value = 'desc';
  }
}

function resetFilters(): void {
  outcomeFilter.value = '';
  sideFilter.value = '';
  priceMin.value = '';
  priceMax.value = '';
  sizeMin.value = '';
  sizeMax.value = '';
  timeFrom.value = '';
  timeTo.value = '';
  sortField.value = 'time';
  sortOrder.value = 'desc';
}

function sortIcon(field: MarketTradeSortField) {
  if (sortField.value !== field) return null;
  return sortOrder.value === 'asc' ? ArrowUp : ArrowDown;
}

function handleRuntimeUpdate(event: TradingMarketEvent): void {
  if (event.eventName !== 'market-trades-state' || event.event.marketId !== props.marketId) return;
  const status = event.event.marketTrades.syncStatus;
  if (status?.conditionId !== props.conditionId) return;
  syncStatus.value = status;
  if (hasActiveQuery.value && !loading.value && !loadingMore.value) {
    void loadPage(0, { silent: items.value.length > 0 });
  }
}

watch(
  () => [props.marketId, props.conditionId] as const,
  () => {
    requestSeq++;
    items.value = [];
    total.value = 0;
    hasMore.value = false;
    error.value = '';
    emit('total-change', 0);
    applyDefaultResult();
  },
  { immediate: true },
);

watch(
  () => [props.defaultResult, props.defaultSyncStatus] as const,
  () => {
    applyDefaultResult();
  },
);

watch(
  [
    outcomeFilter,
    sideFilter,
    priceMin,
    priceMax,
    sizeMin,
    sizeMax,
    timeFrom,
    timeTo,
    sortField,
    sortOrder,
  ],
  () => {
    if (hasActiveQuery.value) scheduleReload();
    else applyDefaultResult();
  },
);

onMounted(() => {
  unsubscribeUpdates = window.api.tradingMarket.onEvent(handleRuntimeUpdate);
});

onUnmounted(() => {
  unsubscribeUpdates?.();
  if (filterTimer) clearTimeout(filterTimer);
});
</script>

<template>
  <section
    class="overflow-hidden"
    :class="
      embedded
        ? 'flex min-h-0 flex-1 flex-col'
        : 'border-border bg-detail-bg max-h-[520px] shrink-0 rounded-lg border'
    "
  >
    <div
      v-if="!embedded"
      class="border-border flex items-center justify-between border-b px-4 py-3"
    >
      <h2 class="text-sm font-semibold text-white">{{ t('tradingWindow.recentTradesTab') }}</h2>
      <LoadingSpinner v-if="initialLoading" :title="t('tradingWindow.loadRecentTrades')" />
      <span v-else class="text-muted text-xs">{{ countLabel }}</span>
    </div>

    <div class="border-border flex shrink-0 flex-wrap items-center gap-2 border-b p-3 text-xs">
      <select
        v-model="outcomeFilter"
        class="border-border text-text h-8 w-auto min-w-[116px] rounded-md border bg-[#1e1e35] px-2 pr-7 outline-none"
        :title="t('tradingWindow.filterOutcome')"
        :aria-label="t('tradingWindow.filterOutcome')"
      >
        <option value="">{{ t('tradingWindow.allOutcomes') }}</option>
        <option v-for="outcome in outcomes" :key="outcome.tokenId" :value="outcome.label">
          {{ outcome.label }}
        </option>
      </select>

      <select
        v-model="sideFilter"
        class="border-border text-text h-8 w-auto min-w-[104px] rounded-md border bg-[#1e1e35] px-2 pr-7 outline-none"
        :title="t('tradingWindow.filterSide')"
        :aria-label="t('tradingWindow.filterSide')"
      >
        <option value="">{{ t('tradingWindow.allSides') }}</option>
        <option value="BUY">{{ t('trade.buy') }}</option>
        <option value="SELL">{{ t('trade.sell') }}</option>
      </select>

      <div class="grid w-[160px] grid-cols-2 gap-2">
        <input
          v-model="priceMin"
          class="border-border text-text h-8 min-w-0 rounded-md border bg-[#1e1e35] px-2 outline-none"
          type="number"
          step="0.001"
          min="0"
          max="1"
          :placeholder="t('tradingWindow.minPrice')"
          :title="t('tradingWindow.minPrice')"
        />
        <input
          v-model="priceMax"
          class="border-border text-text h-8 min-w-0 rounded-md border bg-[#1e1e35] px-2 outline-none"
          type="number"
          step="0.001"
          min="0"
          max="1"
          :placeholder="t('tradingWindow.maxPrice')"
          :title="t('tradingWindow.maxPrice')"
        />
      </div>

      <div class="grid w-[160px] grid-cols-2 gap-2">
        <input
          v-model="sizeMin"
          class="border-border text-text h-8 min-w-0 rounded-md border bg-[#1e1e35] px-2 outline-none"
          type="number"
          step="0.01"
          min="0"
          :placeholder="t('tradingWindow.minShares')"
          :title="t('tradingWindow.minShares')"
        />
        <input
          v-model="sizeMax"
          class="border-border text-text h-8 min-w-0 rounded-md border bg-[#1e1e35] px-2 outline-none"
          type="number"
          step="0.01"
          min="0"
          :placeholder="t('tradingWindow.maxShares')"
          :title="t('tradingWindow.maxShares')"
        />
      </div>

      <div class="grid min-w-[260px] flex-1 grid-cols-2 gap-2">
        <input
          v-model="timeFrom"
          class="border-border text-text h-8 min-w-0 rounded-md border bg-[#1e1e35] px-2 outline-none"
          type="datetime-local"
          :title="t('common.startedAt')"
          :aria-label="t('common.startedAt')"
        />
        <input
          v-model="timeTo"
          class="border-border text-text h-8 min-w-0 rounded-md border bg-[#1e1e35] px-2 outline-none"
          type="datetime-local"
          :title="t('common.endedAt')"
          :aria-label="t('common.endedAt')"
        />
      </div>

      <button
        type="button"
        class="border-border hover:bg-btn-secondary text-muted-light inline-flex h-8 items-center justify-center rounded-md border px-2 transition-colors hover:text-white"
        :title="t('tradingWindow.resetFilters')"
        :aria-label="t('tradingWindow.resetFilters')"
        @click="resetFilters"
      >
        <RotateCcw :size="14" />
      </button>
    </div>

    <div v-if="error" class="px-4 py-3 text-xs text-red-400">
      {{ error }}
    </div>

    <div
      class="overflow-auto"
      :class="embedded ? 'min-h-0 flex-1' : 'max-h-[420px]'"
      @scroll="handleScroll"
    >
      <table class="w-full border-collapse text-sm">
        <thead class="bg-surface sticky top-0">
          <tr>
            <th class="text-muted px-3 py-2 text-left text-xs font-medium">
              <button
                type="button"
                class="inline-flex items-center gap-1"
                @click="toggleSort('outcome')"
              >
                Outcome
                <component :is="sortIcon('outcome')" v-if="sortIcon('outcome')" :size="12" />
              </button>
            </th>
            <th class="text-muted px-3 py-2 text-left text-xs font-medium">
              <button
                type="button"
                class="inline-flex items-center gap-1"
                @click="toggleSort('side')"
              >
                {{ t('trade.direction') }}
                <component :is="sortIcon('side')" v-if="sortIcon('side')" :size="12" />
              </button>
            </th>
            <th class="text-muted px-3 py-2 text-right text-xs font-medium">
              <button
                type="button"
                class="ml-auto inline-flex items-center gap-1"
                @click="toggleSort('price')"
              >
                {{ t('common.price') }}
                <component :is="sortIcon('price')" v-if="sortIcon('price')" :size="12" />
              </button>
            </th>
            <th class="text-muted px-3 py-2 text-right text-xs font-medium">
              <button
                type="button"
                class="ml-auto inline-flex items-center gap-1"
                @click="toggleSort('size')"
              >
                {{ t('position.size') }}
                <component :is="sortIcon('size')" v-if="sortIcon('size')" :size="12" />
              </button>
            </th>
            <th class="text-muted px-3 py-2 text-right text-xs font-medium">
              <button
                type="button"
                class="ml-auto inline-flex items-center gap-1"
                @click="toggleSort('time')"
              >
                {{ t('trade.tradedAt') }}
                <component :is="sortIcon('time')" v-if="sortIcon('time')" :size="12" />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="initialLoading">
            <td :colspan="colspan" class="px-3 py-6 text-center">
              <LoadingSpinner :title="t('tradingWindow.loadRecentTrades')" />
            </td>
          </tr>
          <tr v-for="trade in items" :key="trade.id" class="border-border/50 border-b">
            <td class="text-text px-3 py-2">
              {{ trade.outcome || '—' }}
            </td>
            <td class="px-3 py-2" :class="sideClass(trade.side)">
              {{ sideLabel(trade.side) }}
            </td>
            <td class="text-text px-3 py-2 text-right tabular-nums">
              {{ formatPrice(trade.price) }}
            </td>
            <td class="text-text px-3 py-2 text-right tabular-nums">
              {{ formatNumber(trade.size, 4) }}
            </td>
            <td class="text-muted px-3 py-2 text-right text-xs whitespace-nowrap tabular-nums">
              {{ formatTimestamp(trade.timestamp) }}
            </td>
          </tr>
          <tr v-if="items.length === 0 && !initialLoading">
            <td :colspan="colspan" class="text-muted px-3 py-6 text-center text-xs">
              {{ t('trade.noTrades') }}
            </td>
          </tr>
          <tr v-if="loadingMore">
            <td :colspan="colspan" class="px-3 py-4 text-center">
              <LoadingSpinner :title="t('tradingWindow.loadMoreRecentTrades')" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
