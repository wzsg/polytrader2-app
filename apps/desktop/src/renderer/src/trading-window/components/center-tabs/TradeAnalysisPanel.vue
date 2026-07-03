<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import {
  ColorType,
  CrosshairMode,
  HistogramSeries,
  createChart,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { RotateCcw } from '@lucide/vue';
import type {
  MarketOutcome,
  MarketTradeAnalysisBucket,
  MarketTradeAnalysisPoint,
  MarketTradeAnalysisResult,
  TradingMarketEvent,
} from '@polytrader/shared';
import {
  formatNumber,
  formatPercent,
  formatPrice,
  formatTimestamp,
  formatUsd,
  sideClass,
  sideLabel,
} from '@/shared/utils/format';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';
import { useI18n } from 'vue-i18n';

type TimeRange = 'all' | '24h' | '7d' | 'custom';
type VolumeSeries = ISeriesApi<'Histogram'>;

const props = defineProps<{
  marketId: string;
  conditionId: string;
  outcomes: MarketOutcome[];
}>();

const { t } = useI18n();

const rangeOptions = computed<Array<{ label: string; value: TimeRange }>>(() => [
  { label: t('common.all'), value: 'all' },
  { label: '24h', value: '24h' },
  { label: '7d', value: '7d' },
  { label: t('tradingWindow.customRange'), value: 'custom' },
]);
const BUCKET_OPTIONS: Array<{ label: string; value: MarketTradeAnalysisBucket }> = [
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1h', value: '1h' },
];

const loading = ref(false);
const error = ref('');
const data = ref<MarketTradeAnalysisResult | null>(null);
const range = ref<TimeRange>('all');
const bucket = ref<MarketTradeAnalysisBucket>('5m');
const timeFrom = ref('');
const timeTo = ref('');
const volumeChartEl = ref<HTMLDivElement | null>(null);
const volumeChart = shallowRef<IChartApi | null>(null);
const buyVolumeSeries = shallowRef<VolumeSeries | null>(null);
const sellVolumeSeries = shallowRef<VolumeSeries | null>(null);
const volumeTooltip = ref<{
  visible: boolean;
  left: number;
  top: number;
  time: string;
  buy: string;
  sell: string;
}>({
  visible: false,
  left: 0,
  top: 0,
  time: '',
  buy: '',
  sell: '',
});

let requestSeq = 0;
let filterTimer: ReturnType<typeof setTimeout> | null = null;
let unsubscribeUpdates: (() => void) | null = null;
let resizeObserver: ResizeObserver | null = null;
let renderTimer: ReturnType<typeof setTimeout> | null = null;

const summary = computed(() => data.value?.summary ?? null);
const maxOutcomeSize = computed(() =>
  Math.max(...(data.value?.outcomeBreakdown.map((item) => item.size) ?? [0]), 0),
);
const maxSideSize = computed(() =>
  Math.max(...(data.value?.sideBreakdown.map((item) => item.size) ?? [0]), 0),
);
const timeline = computed(() => aggregateTimeline(data.value?.timeSeries ?? []));
const rangeLabel = computed(
  () => rangeOptions.value.find((item) => item.value === range.value)?.label ?? t('common.all'),
);

function dateTimeLocalValue(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function rangeBounds(): { timeFrom?: string; timeTo?: string } {
  if (range.value === 'custom') {
    return {
      timeFrom: timeFrom.value || undefined,
      timeTo: timeTo.value || undefined,
    };
  }
  if (range.value === '24h') {
    return { timeFrom: dateTimeLocalValue(new Date(Date.now() - 24 * 60 * 60 * 1000)) };
  }
  if (range.value === '7d') {
    return { timeFrom: dateTimeLocalValue(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) };
  }
  return {};
}

function buildQuery() {
  return {
    marketId: props.marketId,
    conditionId: props.conditionId,
    bucket: bucket.value,
    ...rangeBounds(),
  };
}

async function loadAnalysis(options: { silent?: boolean } = {}): Promise<void> {
  const seq = ++requestSeq;
  if (!props.conditionId) {
    data.value = null;
    error.value = '';
    return;
  }

  if (!options.silent) loading.value = true;
  error.value = '';
  try {
    const result = await window.api.getTradingMarketTradeAnalysis(props.marketId, buildQuery());
    if (seq !== requestSeq) return;
    if (!result.ok) {
      error.value = result.error;
      return;
    }
    data.value = result.data;
    if (result.data.error) error.value = result.data.error;
    scheduleVolumeChartRender();
  } finally {
    if (seq === requestSeq && !options.silent) loading.value = false;
  }
}

function scheduleReload(): void {
  if (filterTimer) clearTimeout(filterTimer);
  filterTimer = setTimeout(() => {
    filterTimer = null;
    void loadAnalysis();
  }, 180);
}

function handleRuntimeUpdate(event: TradingMarketEvent): void {
  if (event.eventName !== 'market-trades-state' || event.event.marketId !== props.marketId) return;
  const status = event.event.marketTrades.syncStatus;
  if (status?.conditionId !== props.conditionId) return;
  if (!loading.value) void loadAnalysis({ silent: Boolean(data.value) });
}

function resetFilters(): void {
  range.value = 'all';
  bucket.value = '5m';
  timeFrom.value = '';
  timeTo.value = '';
}

function barWidth(value: number, max: number): string {
  if (max <= 0) return '0%';
  return `${Math.max(4, Math.min(100, (value / max) * 100))}%`;
}

function formatMaybePrice(value: number | null | undefined): string {
  return value == null ? '—' : formatPrice(value);
}

function formatMaybePercent(value: number | null | undefined): string {
  return value == null ? '—' : formatPercent(value * 100);
}

function formatSignedSize(value: number | undefined): string {
  const num = Number(value ?? 0);
  const prefix = num > 0 ? '+' : '';
  return `${prefix}${formatNumber(num, 2)}`;
}

function formatAxisTime(value: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatTooltipTime(value: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function lightweightTimeToMs(time: Time): number {
  if (typeof time === 'number') return time * 1000;
  if (typeof time === 'string') return new Date(time).getTime();
  return Date.UTC(time.year, time.month - 1, time.day);
}

function toUtcTimestamp(value: number): UTCTimestamp {
  return Math.floor(value) as UTCTimestamp;
}

function createVolumeChartOptions(width: number, height: number) {
  return {
    width,
    height,
    autoSize: false,
    layout: {
      background: { type: ColorType.Solid, color: 'transparent' },
      textColor: '#8b8ba7',
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: 'rgba(42, 42, 62, 0.28)' },
      horzLines: { color: '#242438' },
    },
    rightPriceScale: {
      borderColor: '#2a2a3e',
      scaleMargins: { top: 0.16, bottom: 0.16 },
    },
    timeScale: {
      borderColor: '#2a2a3e',
      timeVisible: true,
      secondsVisible: false,
      tickMarkFormatter: (time: Time) => formatAxisTime(lightweightTimeToMs(time)),
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: '#6366f1', labelBackgroundColor: '#4f46e5' },
      horzLine: { color: '#6366f1', labelBackgroundColor: '#4f46e5' },
    },
    handleScale: {
      axisPressedMouseMove: true,
      mouseWheel: true,
      pinch: true,
    },
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: false,
    },
    localization: {
      priceFormatter: (value: number) => formatNumber(Math.abs(value), 0),
      timeFormatter: (time: Time) => formatTooltipTime(lightweightTimeToMs(time)),
    },
  };
}

function buildVolumeSeriesData(side: 'buy' | 'sell'): HistogramData<Time>[] {
  return timeline.value.map((point) => ({
    time: toUtcTimestamp(point.bucketStart),
    value: side === 'buy' ? point.buySize : -point.sellSize,
    color: side === 'buy' ? '#22c55e' : '#ef4444',
  }));
}

function renderVolumeChart(): void {
  if (!volumeChart.value || !buyVolumeSeries.value || !sellVolumeSeries.value) return;
  buyVolumeSeries.value.setData(buildVolumeSeriesData('buy'));
  sellVolumeSeries.value.setData(buildVolumeSeriesData('sell'));
  if (timeline.value.length) volumeChart.value.timeScale().fitContent();
}

function resizeVolumeChart(): void {
  if (!volumeChart.value || !volumeChartEl.value) return;
  const { clientWidth, clientHeight } = volumeChartEl.value;
  volumeChart.value.resize(Math.max(1, clientWidth), Math.max(1, clientHeight));
}

function handleVolumeCrosshairMove(params: MouseEventParams<Time>): void {
  if (!params.point || !params.time || !volumeChartEl.value) {
    volumeTooltip.value.visible = false;
    return;
  }

  const buyItem = buyVolumeSeries.value ? params.seriesData.get(buyVolumeSeries.value) : undefined;
  const sellItem = sellVolumeSeries.value
    ? params.seriesData.get(sellVolumeSeries.value)
    : undefined;
  const buy = buyItem && 'value' in buyItem ? Number(buyItem.value) : 0;
  const sell = sellItem && 'value' in sellItem ? Math.abs(Number(sellItem.value)) : 0;
  if (!buy && !sell) {
    volumeTooltip.value.visible = false;
    return;
  }

  const width = volumeChartEl.value.clientWidth;
  const tooltipWidth = 170;
  volumeTooltip.value = {
    visible: true,
    left: Math.min(params.point.x + 12, Math.max(0, width - tooltipWidth - 8)),
    top: Math.max(8, params.point.y - 12),
    time: formatTooltipTime(lightweightTimeToMs(params.time)),
    buy: formatNumber(buy, 2),
    sell: formatNumber(sell, 2),
  };
}

function initVolumeChart(): void {
  if (!volumeChartEl.value || volumeChart.value) return;
  const { clientWidth, clientHeight } = volumeChartEl.value;
  volumeChart.value = createChart(
    volumeChartEl.value,
    createVolumeChartOptions(Math.max(1, clientWidth), Math.max(1, clientHeight)),
  );
  buyVolumeSeries.value = volumeChart.value.addSeries(HistogramSeries, {
    color: '#22c55e',
    priceLineVisible: false,
    lastValueVisible: false,
  });
  sellVolumeSeries.value = volumeChart.value.addSeries(HistogramSeries, {
    color: '#ef4444',
    priceLineVisible: false,
    lastValueVisible: false,
  });
  volumeChart.value.subscribeCrosshairMove(handleVolumeCrosshairMove);
  renderVolumeChart();
}

function scheduleVolumeChartRender(): void {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    renderTimer = null;
    void nextTick(() => {
      initVolumeChart();
      renderVolumeChart();
    });
  }, 0);
}

function aggregateTimeline(points: MarketTradeAnalysisPoint[]) {
  const byBucket = new Map<
    number,
    {
      bucketStart: number;
      trades: number;
      size: number;
      notional: number;
      buySize: number;
      sellSize: number;
      vwap: number | null;
      imbalance: number;
      imbalanceRatio: number | null;
    }
  >();

  for (const point of points) {
    const existing = byBucket.get(point.bucketStart) ?? {
      bucketStart: point.bucketStart,
      trades: 0,
      size: 0,
      notional: 0,
      buySize: 0,
      sellSize: 0,
      vwap: null,
      imbalance: 0,
      imbalanceRatio: null,
    };
    existing.trades += point.trades;
    existing.size += point.size;
    existing.notional += point.notional;
    existing.buySize += point.buySize;
    existing.sellSize += point.sellSize;
    existing.imbalance = existing.buySize - existing.sellSize;
    existing.imbalanceRatio =
      existing.size > 0 ? (existing.buySize - existing.sellSize) / existing.size : null;
    existing.vwap = existing.size > 0 ? existing.notional / existing.size : null;
    byBucket.set(point.bucketStart, existing);
  }

  return [...byBucket.values()].sort((a, b) => a.bucketStart - b.bucketStart).slice(-48);
}

watch(
  () => [props.marketId, props.conditionId] as const,
  () => {
    requestSeq++;
    data.value = null;
    error.value = '';
    void loadAnalysis();
  },
  { immediate: true },
);

watch([range, bucket, timeFrom, timeTo], scheduleReload);

onMounted(() => {
  unsubscribeUpdates = window.api.onTradingMarketEvent(handleRuntimeUpdate);
  void nextTick(() => {
    initVolumeChart();
    if (volumeChartEl.value) {
      resizeObserver = new ResizeObserver(() => {
        resizeVolumeChart();
        scheduleVolumeChartRender();
      });
      resizeObserver.observe(volumeChartEl.value);
    }
    scheduleVolumeChartRender();
  });
});

onUnmounted(() => {
  unsubscribeUpdates?.();
  resizeObserver?.disconnect();
  volumeChart.value?.remove();
  volumeChart.value = null;
  buyVolumeSeries.value = null;
  sellVolumeSeries.value = null;
  if (filterTimer) clearTimeout(filterTimer);
  if (renderTimer) clearTimeout(renderTimer);
});

watch(timeline, () => scheduleVolumeChartRender(), { deep: true });
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div class="border-border flex shrink-0 flex-wrap items-center gap-2 border-b p-3 text-xs">
      <div class="border-border bg-surface inline-flex h-8 rounded-md border p-0.5">
        <button
          v-for="option in rangeOptions"
          :key="option.value"
          type="button"
          class="min-w-12 rounded px-2 text-xs font-medium transition-colors"
          :class="
            range === option.value
              ? 'bg-primary text-white'
              : 'text-muted-light hover:bg-btn-secondary hover:text-white'
          "
          @click="range = option.value"
        >
          {{ option.label }}
        </button>
      </div>

      <div class="flex flex-wrap gap-2">
        <input
          v-model="timeFrom"
          class="border-border text-text h-8 w-[178px] rounded-md border bg-[#1e1e35] px-2 outline-none disabled:opacity-40"
          type="datetime-local"
          :title="t('common.startedAt')"
          :aria-label="t('common.startedAt')"
          :disabled="range !== 'custom'"
        />
        <input
          v-model="timeTo"
          class="border-border text-text h-8 w-[178px] rounded-md border bg-[#1e1e35] px-2 outline-none disabled:opacity-40"
          type="datetime-local"
          :title="t('common.endedAt')"
          :aria-label="t('common.endedAt')"
          :disabled="range !== 'custom'"
        />
      </div>

      <button
        type="button"
        class="border-border hover:bg-btn-secondary text-muted-light inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors hover:text-white"
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

    <div class="relative min-h-0 flex-1 overflow-auto p-4" :aria-busy="loading">
      <div
        v-if="loading"
        class="bg-detail-bg/55 absolute inset-0 z-10 flex items-center justify-center backdrop-blur-[1px]"
      >
        <LoadingSpinner :size="18" :title="t('tradingWindow.loadTradeAnalysis')" />
      </div>

      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div class="border-border bg-detail-bg border p-3">
          <p class="text-muted text-xs">{{ t('tradingWindow.tradeCount') }}</p>
          <p class="text-primary-light mt-1 text-lg font-semibold">
            {{ formatNumber(summary?.totalTrades, 0) }}
          </p>
        </div>
        <div class="border-border bg-detail-bg border p-3">
          <p class="text-muted text-xs">{{ t('tradingWindow.tradedShares') }}</p>
          <p class="text-primary-light mt-1 text-lg font-semibold">
            {{ formatNumber(summary?.totalSize, 2) }}
          </p>
        </div>
        <div class="border-border bg-detail-bg border p-3">
          <p class="text-muted text-xs">{{ t('tradingWindow.notional') }}</p>
          <p class="text-primary-light mt-1 text-lg font-semibold">
            {{ formatUsd(summary?.notional) }}
          </p>
        </div>
        <div class="border-border bg-detail-bg border p-3">
          <p class="text-muted text-xs">VWAP</p>
          <p class="text-primary-light mt-1 text-lg font-semibold">
            {{ formatMaybePrice(summary?.vwap) }}
          </p>
        </div>
        <div class="border-border bg-detail-bg border p-3">
          <p class="text-muted text-xs">{{ t('tradingWindow.latestPrice') }}</p>
          <p class="text-primary-light mt-1 text-lg font-semibold">
            {{ formatMaybePrice(summary?.latestPrice) }}
          </p>
        </div>
        <div class="border-border bg-detail-bg border p-3">
          <p class="text-muted text-xs">{{ t('tradingWindow.highLow') }}</p>
          <p class="text-primary-light mt-1 text-lg font-semibold">
            {{ formatMaybePrice(summary?.highPrice) }} / {{ formatMaybePrice(summary?.lowPrice) }}
          </p>
        </div>
        <div class="border-border bg-detail-bg border p-3">
          <p class="text-muted text-xs">{{ t('tradingWindow.volumeImbalance') }}</p>
          <p
            class="mt-1 text-lg font-semibold"
            :class="(summary?.imbalance ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'"
          >
            {{ formatSignedSize(summary?.imbalance) }}
          </p>
        </div>
        <div class="border-border bg-detail-bg border p-3">
          <p class="text-muted text-xs">{{ t('tradingWindow.buySellPressure') }}</p>
          <p
            class="mt-1 text-lg font-semibold"
            :class="(summary?.imbalanceRatio ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'"
          >
            {{ formatMaybePercent(summary?.imbalanceRatio) }}
          </p>
        </div>
      </div>

      <div class="mt-4 grid gap-4 xl:grid-cols-2">
        <section class="border-border bg-detail-bg border">
          <div class="border-border flex items-center justify-between border-b px-4 py-3">
            <h3 class="text-sm font-semibold text-white">
              {{ t('tradingWindow.outcomeDistribution') }}
            </h3>
            <span class="text-muted text-xs">{{ rangeLabel }}</span>
          </div>
          <div class="grid gap-3 p-4">
            <div v-for="item in data?.outcomeBreakdown ?? []" :key="item.key">
              <div class="mb-1 flex items-center justify-between gap-3 text-xs">
                <span class="text-text">{{ item.key }}</span>
                <span class="text-muted">{{ formatNumber(item.size, 2) }}</span>
              </div>
              <div class="bg-bg h-2 overflow-hidden rounded">
                <div
                  class="bg-primary h-full"
                  :style="{ width: barWidth(item.size, maxOutcomeSize) }"
                />
              </div>
              <div class="text-muted mt-1 flex justify-between text-[11px]">
                <span>VWAP {{ formatMaybePrice(item.vwap) }}</span>
                <span
                  >{{ t('tradingWindow.pressure') }}
                  {{ formatMaybePercent(item.imbalanceRatio) }}</span
                >
              </div>
            </div>
          </div>
        </section>

        <section class="border-border bg-detail-bg border">
          <div class="border-border flex items-center justify-between border-b px-4 py-3">
            <h3 class="text-sm font-semibold text-white">
              {{ t('tradingWindow.sideDistribution') }}
            </h3>
            <span class="text-muted text-xs">{{ rangeLabel }}</span>
          </div>
          <div class="grid gap-3 p-4">
            <div v-for="item in data?.sideBreakdown ?? []" :key="item.key">
              <div class="mb-1 flex items-center justify-between gap-3 text-xs">
                <span :class="sideClass(item.key)">{{ sideLabel(item.key) }}</span>
                <span class="text-muted">{{ formatNumber(item.size, 2) }}</span>
              </div>
              <div class="bg-bg h-2 overflow-hidden rounded">
                <div
                  class="h-full"
                  :class="item.key === 'BUY' ? 'bg-green-400' : 'bg-red-400'"
                  :style="{ width: barWidth(item.size, maxSideSize) }"
                />
              </div>
              <div class="text-muted mt-1 flex justify-between text-[11px]">
                <span>{{ t('tradingWindow.countTrades', { count: item.trades }) }}</span>
                <span>{{ formatUsd(item.notional) }}</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section class="border-border bg-detail-bg mt-4 border">
        <div
          class="border-border flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"
        >
          <div class="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
            <h3 class="text-sm font-semibold text-white">{{ t('tradingWindow.volumeChart') }}</h3>
            <div class="flex items-center gap-3 text-xs">
              <span class="inline-flex items-center gap-1.5 text-green-400">
                <span class="h-2 w-2 rounded-full bg-green-400" />
                {{ t('tradingWindow.buyVolume') }}
              </span>
              <span class="inline-flex items-center gap-1.5 text-red-400">
                <span class="h-2 w-2 rounded-full bg-red-400" />
                {{ t('tradingWindow.sellVolume') }}
              </span>
            </div>
          </div>
          <div
            class="border-border bg-surface inline-flex h-7 rounded-md border p-0.5"
            :title="t('tradingWindow.volumeBucket')"
            :aria-label="t('tradingWindow.volumeBucket')"
          >
            <button
              v-for="option in BUCKET_OPTIONS"
              :key="option.value"
              type="button"
              class="min-w-9 rounded px-2 text-xs font-medium transition-colors"
              :class="
                bucket === option.value
                  ? 'bg-primary text-white'
                  : 'text-muted-light hover:bg-btn-secondary hover:text-white'
              "
              @click="bucket = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
        <div class="relative h-[320px] min-h-[320px] p-4">
          <div ref="volumeChartEl" class="h-full min-h-[288px] w-full min-w-[320px]" />
          <div
            v-if="volumeTooltip.visible"
            class="border-border bg-surface/95 pointer-events-none absolute z-20 w-[170px] border px-3 py-2 text-xs shadow-xl"
            :style="{ left: `${volumeTooltip.left}px`, top: `${volumeTooltip.top}px` }"
          >
            <div class="text-muted mb-1 whitespace-nowrap">{{ volumeTooltip.time }}</div>
            <div class="flex items-center gap-2">
              <span class="h-2 w-2 rounded-full bg-green-400" />
              <span class="text-text flex-1">{{ t('tradingWindow.buyVolume') }}</span>
              <span class="font-semibold text-green-400 tabular-nums">{{ volumeTooltip.buy }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="h-2 w-2 rounded-full bg-red-400" />
              <span class="text-text flex-1">{{ t('tradingWindow.sellVolume') }}</span>
              <span class="font-semibold text-red-400 tabular-nums">{{ volumeTooltip.sell }}</span>
            </div>
          </div>
          <div
            v-if="timeline.length === 0"
            class="text-muted pointer-events-none absolute inset-0 flex items-center justify-center text-sm"
          >
            {{ t('trade.noTrades') }}
          </div>
        </div>
      </section>

      <section class="border-border bg-detail-bg mt-4 border">
        <div class="border-border flex items-center justify-between border-b px-4 py-3">
          <h3 class="text-sm font-semibold text-white">{{ t('tradingWindow.largeTrades') }}</h3>
          <span class="text-muted text-xs">{{ t('tradingWindow.sortedByShares') }}</span>
        </div>
        <div class="overflow-auto">
          <table class="w-full border-collapse text-sm">
            <thead class="bg-surface">
              <tr>
                <th class="text-muted px-3 py-2 text-left text-xs font-medium">Outcome</th>
                <th class="text-muted px-3 py-2 text-left text-xs font-medium">
                  {{ t('trade.direction') }}
                </th>
                <th class="text-muted px-3 py-2 text-right text-xs font-medium">
                  {{ t('common.price') }}
                </th>
                <th class="text-muted px-3 py-2 text-right text-xs font-medium">
                  {{ t('position.size') }}
                </th>
                <th class="text-muted px-3 py-2 text-right text-xs font-medium">
                  {{ t('trade.tradedAt') }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="trade in data?.largeTrades ?? []"
                :key="trade.id"
                class="border-border/50 border-b"
              >
                <td class="text-text px-3 py-2">{{ trade.outcome || '—' }}</td>
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
              <tr v-if="(data?.largeTrades.length ?? 0) === 0">
                <td colspan="5" class="text-muted px-3 py-6 text-center text-xs">
                  {{ t('trade.noTrades') }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </section>
</template>
