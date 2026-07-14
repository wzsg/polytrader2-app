<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import {
  ColorType,
  CrosshairMode,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { MarketOutcome, PriceHistoryPoint } from '@polytrader/shared';
import { formatPrice } from '@/shared/utils/format';
import { currentLocale, getCurrentIntlLocale } from '@/shared/i18n';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';
import { useI18n } from 'vue-i18n';
import {
  PRICE_HISTORY_RANGE_OPTIONS,
  type PriceHistoryRange,
} from '../../composables/usePriceHistoryRange';

const props = defineProps<{
  marketId: string;
  outcomes: MarketOutcome[];
  priceHistory: Record<string, PriceHistoryPoint[]>;
  loading: boolean;
  historyRange: PriceHistoryRange;
}>();

const emit = defineEmits<{
  'update:historyRange': [range: PriceHistoryRange];
}>();

const { t } = useI18n();

type PriceSeries = ISeriesApi<'Line'>;

const MIN_Y_AXIS_RANGE = 0.08;
const SERIES_COLORS = ['#63e6be', '#ff6b6b', '#74c0fc', '#ffd43b', '#b197fc', '#ffa94d'];
const MINUTE_MS = 60_000;

const chartEl = ref<HTMLDivElement | null>(null);
const chart = shallowRef<IChartApi | null>(null);
const seriesByToken = new Map<string, PriceSeries>();
const seriesMeta = new Map<PriceSeries, { label: string; color: string }>();
const tooltip = ref<{
  visible: boolean;
  left: number;
  top: number;
  time: string;
  rows: Array<{ label: string; color: string; value: string }>;
}>({
  visible: false,
  left: 0,
  top: 0,
  time: '',
  rows: [],
});
let resizeObserver: ResizeObserver | null = null;

const tokenIds = computed(() => props.outcomes.map((item) => item.tokenId).filter(Boolean));

const seriesPoints = computed<Record<string, PriceHistoryPoint[]>>(() => {
  return Object.fromEntries(
    props.outcomes.map((outcome) => [outcome.tokenId, buildTokenPoints(outcome.tokenId)]),
  );
});

const totalPointCount = computed(() =>
  Object.values(seriesPoints.value).reduce((total, points) => total + points.length, 0),
);

const statusText = computed(() => {
  if (!props.outcomes.length) return t('tradingWindow.noOutcome');
  if (!totalPointCount.value) return t('tradingWindow.noPriceTrend');
  return t('tradingWindow.priceTrendStatus', {
    count: props.outcomes.length,
    points: totalPointCount.value,
  });
});

const hasHistory = computed(() =>
  Object.values(props.priceHistory).some((points) => points.length > 0),
);

function buildTokenPoints(tokenId: string): PriceHistoryPoint[] {
  const history = normalizeHistoryPoints(props.priceHistory[tokenId] ?? []);
  const byTime = new Map<number, PriceHistoryPoint>();
  for (const point of history) {
    byTime.set(point.t, point);
  }
  return [...byTime.values()].sort((a, b) => a.t - b.t);
}

function getOutcomeColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

function hasAnyPoints(): boolean {
  return Object.values(seriesPoints.value).some((points) => points.length > 0);
}

function normalizeHistoryPoints(points: PriceHistoryPoint[]): PriceHistoryPoint[] {
  return points
    .map((point) => ({
      ...point,
      t: Math.floor(point.t / MINUTE_MS) * MINUTE_MS,
    }))
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.p));
}

function getErrorTone(): boolean {
  return !hasHistory.value && !props.loading;
}

function formatAxisTime(value: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(getCurrentIntlLocale(), { hour: '2-digit', minute: '2-digit' });
}

function formatTooltipTime(value: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(getCurrentIntlLocale(), {
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
  return Math.floor(value / 1000) as UTCTimestamp;
}

function createChartOptions(width: number, height: number) {
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
      scaleMargins: { top: 0.18, bottom: 0.12 },
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
      locale: getCurrentIntlLocale(),
      timeFormatter: (time: Time) => formatTooltipTime(lightweightTimeToMs(time)),
      priceFormatter: (price: number) => `${(price * 100).toFixed(1)}¢`,
    },
  };
}

function buildLineData(tokenId: string): LineData<Time>[] {
  const byTime = new Map<number, number>();
  for (const point of seriesPoints.value[tokenId] ?? []) {
    if (!Number.isFinite(point.t) || !Number.isFinite(point.p)) continue;
    byTime.set(toUtcTimestamp(point.t), point.p);
  }
  return [...byTime.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([time, value]) => ({ time: time as UTCTimestamp, value }));
}

function ensureSeries(): void {
  if (!chart.value) return;
  const activeTokens = new Set(tokenIds.value);

  for (const [tokenId, series] of seriesByToken.entries()) {
    if (activeTokens.has(tokenId)) continue;
    chart.value.removeSeries(series);
    seriesByToken.delete(tokenId);
    seriesMeta.delete(series);
  }

  for (const [index, outcome] of props.outcomes.entries()) {
    if (!outcome.tokenId || seriesByToken.has(outcome.tokenId)) continue;
    const color = getOutcomeColor(index);
    const series = chart.value.addSeries(LineSeries, {
      color,
      lineWidth: 2,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
    });
    seriesByToken.set(outcome.tokenId, series);
    seriesMeta.set(series, { label: outcome.displayLabel, color });
  }
}

function renderChart(): void {
  if (!chart.value) return;
  ensureSeries();
  for (const outcome of props.outcomes) {
    seriesByToken.get(outcome.tokenId)?.setData(buildLineData(outcome.tokenId));
  }
  if (hasAnyPoints()) chart.value.timeScale().fitContent();
}

function resizeChart(): void {
  if (!chart.value || !chartEl.value) return;
  const { clientWidth, clientHeight } = chartEl.value;
  chart.value.resize(Math.max(1, clientWidth), Math.max(1, clientHeight));
}

function handleCrosshairMove(params: MouseEventParams<Time>): void {
  if (!params.point || !params.time || !chartEl.value) {
    tooltip.value.visible = false;
    return;
  }

  const rows: Array<{ label: string; color: string; value: string }> = [];
  for (const [series, meta] of seriesMeta.entries()) {
    const item = params.seriesData.get(series);
    if (!item || !('value' in item)) continue;
    rows.push({ ...meta, value: formatPrice(item.value) });
  }

  if (!rows.length) {
    tooltip.value.visible = false;
    return;
  }

  const width = chartEl.value.clientWidth;
  const tooltipWidth = 190;
  const left = Math.min(params.point.x + 12, Math.max(0, width - tooltipWidth - 8));
  const top = Math.max(8, params.point.y - 12);
  tooltip.value = {
    visible: true,
    left,
    top,
    time: formatTooltipTime(lightweightTimeToMs(params.time)),
    rows,
  };
}

function initChart(): void {
  if (!chartEl.value || chart.value) return;
  const { clientWidth, clientHeight } = chartEl.value;
  chart.value = createChart(
    chartEl.value,
    createChartOptions(Math.max(1, clientWidth), Math.max(1, clientHeight)),
  );
  chart.value.subscribeCrosshairMove(handleCrosshairMove);
  renderChart();
}

function updateChartOptions(): void {
  if (!chart.value) return;
  chart.value.applyOptions(
    createChartOptions(chartEl.value?.clientWidth ?? 1, chartEl.value?.clientHeight ?? 1),
  );
}

function getYAxisBounds(): { min: number; max: number; showDecimals: boolean } {
  const prices = Object.values(seriesPoints.value)
    .flat()
    .map((point) => point.p)
    .filter((price) => Number.isFinite(price));

  if (!prices.length) return { min: 0, max: 1, showDecimals: false };

  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const range = Math.max(high - low, 0);
  const padding = Math.max(range * 0.25, 0.01);
  let min = low - padding;
  let max = high + padding;

  if (max - min < MIN_Y_AXIS_RANGE) {
    const center = (low + high) / 2;
    min = center - MIN_Y_AXIS_RANGE / 2;
    max = center + MIN_Y_AXIS_RANGE / 2;
  }

  return { min, max, showDecimals: max - min < 0.2 };
}

function syncPriceScaleBounds(): void {
  const bounds = getYAxisBounds();
  chart.value?.applyOptions({
    localization: {
      locale: getCurrentIntlLocale(),
      priceFormatter: (price: number) => `${(price * 100).toFixed(bounds.showDecimals ? 1 : 0)}¢`,
    },
  });
}

onMounted(() => {
  initChart();
  if (chartEl.value) {
    resizeObserver = new ResizeObserver(() => {
      resizeChart();
      renderChart();
    });
    resizeObserver.observe(chartEl.value);
  }
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  chart.value?.remove();
  chart.value = null;
  seriesByToken.clear();
  seriesMeta.clear();
});

watch(
  [seriesPoints, currentLocale],
  async () => {
    await nextTick();
    initChart();
    updateChartOptions();
    syncPriceScaleBounds();
    renderChart();
  },
  { deep: true },
);
</script>

<template>
  <section class="border-border bg-detail-bg flex h-full min-h-0 flex-col overflow-hidden border">
    <div class="border-border flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-2">
        <h2 class="shrink-0 text-sm font-semibold text-white">
          {{ t('tradingWindow.priceTrend') }}
        </h2>
        <div
          v-if="props.outcomes.length"
          class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs"
        >
          <span
            v-for="(outcome, index) in props.outcomes"
            :key="outcome.tokenId || outcome.label"
            class="inline-flex min-w-0 items-center gap-1.5"
          >
            <span
              class="h-2 w-2 shrink-0 rounded-full"
              :style="{ backgroundColor: getOutcomeColor(index) }"
            />
            <span class="text-muted-light max-w-32 truncate">{{ outcome.displayLabel }}</span>
          </span>
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <LoadingSpinner v-if="loading" :title="t('tradingWindow.loadPriceTrend')" />
        <span
          v-else-if="!totalPointCount"
          class="text-xs"
          :class="getErrorTone() ? 'text-amber-300' : 'text-muted'"
        >
          {{ statusText }}
        </span>
        <div class="border-border bg-surface inline-flex rounded-md border p-0.5">
          <button
            v-for="option in PRICE_HISTORY_RANGE_OPTIONS"
            :key="option.value"
            type="button"
            class="min-w-10 rounded px-2.5 py-1 text-xs font-medium transition-colors"
            :class="
              historyRange === option.value
                ? 'bg-primary text-white'
                : 'text-muted-light hover:bg-btn-secondary hover:text-white'
            "
            :aria-pressed="historyRange === option.value"
            @click="emit('update:historyRange', option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
    </div>

    <div class="relative min-h-[360px] flex-1">
      <div ref="chartEl" class="h-full w-full" />
      <div
        v-if="tooltip.visible"
        class="border-border bg-surface/95 pointer-events-none absolute z-20 w-[190px] border px-3 py-2 text-xs shadow-xl"
        :style="{ left: `${tooltip.left}px`, top: `${tooltip.top}px` }"
      >
        <div class="text-muted mb-1 whitespace-nowrap">{{ tooltip.time }}</div>
        <div v-for="row in tooltip.rows" :key="row.label" class="flex items-center gap-2">
          <span class="h-2 w-2 shrink-0 rounded-full" :style="{ backgroundColor: row.color }" />
          <span class="text-text min-w-0 flex-1 truncate">{{ row.label }}</span>
          <span class="text-primary-light font-semibold tabular-nums">{{ row.value }}</span>
        </div>
      </div>
      <div
        v-if="!hasAnyPoints() && !loading"
        class="text-muted pointer-events-none absolute inset-0 flex items-center justify-center text-sm"
      >
        {{ statusText }}
      </div>
    </div>
  </section>
</template>
