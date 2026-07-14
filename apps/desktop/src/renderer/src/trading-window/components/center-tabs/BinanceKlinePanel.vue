<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { TradingMarketSnapshot } from '@polytrader/shared';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';
import { currentLocale, getCurrentIntlLocale } from '@/shared/i18n';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  binanceKline: NonNullable<TradingMarketSnapshot['binanceKline']>;
}>();

const { t } = useI18n();
type KlineSeries = ISeriesApi<'Candlestick'>;

const chartEl = ref<HTMLDivElement | null>(null);
const chart = shallowRef<IChartApi | null>(null);
const series = shallowRef<KlineSeries | null>(null);
const referencePriceLine = shallowRef<IPriceLine | null>(null);
const nowMs = ref(Date.now());
const tooltip = ref({
  visible: false,
  left: 0,
  top: 0,
  time: '',
  open: '',
  high: '',
  low: '',
  close: '',
});
let resizeObserver: ResizeObserver | null = null;
let countdownTimer: ReturnType<typeof setInterval> | null = null;

const normalizedCandles = computed(() =>
  props.binanceKline.candles
    .map((candle) => ({
      ...candle,
      openMs: Date.parse(candle.openTime),
      openValue: Number(candle.open),
      highValue: Number(candle.high),
      lowValue: Number(candle.low),
      closeValue: Number(candle.close),
    }))
    .filter(
      (candle) =>
        Number.isFinite(candle.openMs) &&
        Number.isFinite(candle.openValue) &&
        Number.isFinite(candle.highValue) &&
        Number.isFinite(candle.lowValue) &&
        Number.isFinite(candle.closeValue),
    )
    .sort((left, right) => left.openMs - right.openMs),
);

const referenceOpen = computed(() => Number(props.binanceKline.referenceCandle?.open));
const currentPrice = computed(() => {
  const referenceClose = Number(props.binanceKline.referenceCandle?.close);
  if (props.binanceKline.status === 'closed' && Number.isFinite(referenceClose)) {
    return referenceClose;
  }
  const tradePrice = Number(props.binanceKline.latestTrade?.price);
  if (Number.isFinite(tradePrice)) return tradePrice;
  if (Number.isFinite(referenceClose)) return referenceClose;
  return normalizedCandles.value.at(-1)?.closeValue ?? Number.NaN;
});
const priceMove = computed(() => currentPrice.value - referenceOpen.value);
const priceMovePercent = computed(() =>
  Number.isFinite(priceMove.value) &&
  Number.isFinite(referenceOpen.value) &&
  referenceOpen.value !== 0
    ? (priceMove.value / referenceOpen.value) * 100
    : Number.NaN,
);
const title = computed(() =>
  t('tradingWindow.binanceKlineTitle', { symbol: formatSymbol(props.binanceKline.symbol) }),
);
const venueLabel = computed(() =>
  props.binanceKline.venue === 'spot'
    ? t('tradingWindow.binanceKlineSpot')
    : t('tradingWindow.binanceKlineFutures'),
);
const loading = computed(() => props.binanceKline.status === 'loading');
const statusLabel = computed(() => {
  switch (props.binanceKline.status) {
    case 'live':
      return t('tradingWindow.cryptoTickLive');
    case 'closed':
      return t('tradingWindow.cryptoTickClosed');
    case 'error':
      return t('tradingWindow.cryptoTickError');
    case 'loading':
      return t('tradingWindow.binanceKlineLoading');
    default:
      return t('tradingWindow.cryptoTickIdle');
  }
});
const statusDotClass = computed(() => {
  if (props.binanceKline.status === 'live')
    return 'bg-green-400 shadow-[0_0_0_3px_rgba(34,197,94,0.16)]';
  if (props.binanceKline.status === 'loading') return 'animate-pulse bg-sky-300';
  if (props.binanceKline.status === 'error')
    return 'bg-red-400 shadow-[0_0_0_3px_rgba(248,113,113,0.16)]';
  return 'bg-muted-light';
});
const priceToneClass = computed(() => {
  if (!Number.isFinite(priceMove.value) || priceMove.value === 0) return 'text-muted-light';
  return priceMove.value > 0 ? 'text-green-400' : 'text-red-400';
});
const moveLabel = computed(() => {
  if (!Number.isFinite(priceMove.value) || !Number.isFinite(priceMovePercent.value)) return '—';
  const sign = priceMove.value > 0 ? '+' : '';
  return `${sign}${formatMarketPrice(priceMove.value)} (${sign}${priceMovePercent.value.toFixed(3)}%)`;
});
const phaseLabel = computed(() => {
  const startMs = Date.parse(props.binanceKline.referenceStartTime ?? '');
  const endMs = Date.parse(props.binanceKline.referenceEndTime ?? '');
  if (Number.isFinite(startMs) && nowMs.value < startMs) return t('tradingWindow.cryptoTickStatus');
  if (props.binanceKline.status === 'closed' || (Number.isFinite(endMs) && nowMs.value >= endMs)) {
    return t('tradingWindow.cryptoTickResult');
  }
  return t('tradingWindow.cryptoTickCountdown');
});
const phaseValue = computed(() => {
  const startMs = Date.parse(props.binanceKline.referenceStartTime ?? '');
  const endMs = Date.parse(props.binanceKline.referenceEndTime ?? '');
  if (Number.isFinite(startMs) && nowMs.value < startMs)
    return t('tradingWindow.cryptoTickNotStarted');
  if (props.binanceKline.status === 'closed' || (Number.isFinite(endMs) && nowMs.value >= endMs)) {
    if (!Number.isFinite(priceMove.value)) return t('tradingWindow.cryptoTickSettling');
    return priceMove.value >= 0
      ? t('tradingWindow.cryptoTickResultUp')
      : t('tradingWindow.cryptoTickResultDown');
  }
  return formatCountdown(Math.max(0, endMs - nowMs.value));
});

function createChartOptions(width: number, height: number) {
  return {
    width,
    height,
    layout: {
      background: { type: ColorType.Solid, color: '#111827' },
      textColor: '#9ca3af',
      fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    },
    grid: {
      vertLines: { color: 'rgba(148, 163, 184, 0.08)' },
      horzLines: { color: 'rgba(148, 163, 184, 0.08)' },
    },
    crosshair: { mode: CrosshairMode.Normal },
    rightPriceScale: { borderColor: 'rgba(148, 163, 184, 0.18)' },
    timeScale: {
      borderColor: 'rgba(148, 163, 184, 0.18)',
      timeVisible: true,
      secondsVisible: false,
      tickMarkFormatter: (time: Time) => formatAxisTime(time),
    },
    localization: {
      locale: getCurrentIntlLocale(),
      priceFormatter: (price: number) => formatMarketPrice(price),
    },
  } as const;
}

function initChart(): void {
  if (!chartEl.value || chart.value) return;
  chart.value = createChart(
    chartEl.value,
    createChartOptions(
      Math.max(1, chartEl.value.clientWidth),
      Math.max(1, chartEl.value.clientHeight),
    ),
  );
  series.value = chart.value.addSeries(CandlestickSeries, {
    upColor: '#22c55e',
    downColor: '#ef4444',
    borderUpColor: '#22c55e',
    borderDownColor: '#ef4444',
    wickUpColor: '#4ade80',
    wickDownColor: '#f87171',
    priceLineVisible: true,
    lastValueVisible: true,
  });
  chart.value.subscribeCrosshairMove(handleCrosshairMove);
  renderChart();
}

function renderChart(): void {
  if (!chart.value || !series.value) return;
  const data: CandlestickData<UTCTimestamp>[] = normalizedCandles.value.map((candle) => ({
    time: Math.floor(candle.openMs / 1000) as UTCTimestamp,
    open: candle.openValue,
    high: candle.highValue,
    low: candle.lowValue,
    close: candle.closeValue,
  }));
  series.value.setData(data);
  updateReferenceLine();
  if (data.length) chart.value.timeScale().fitContent();
}

function updateReferenceLine(): void {
  if (!series.value) return;
  if (referencePriceLine.value) {
    series.value.removePriceLine(referencePriceLine.value);
    referencePriceLine.value = null;
  }
  if (!Number.isFinite(referenceOpen.value)) return;
  referencePriceLine.value = series.value.createPriceLine({
    price: referenceOpen.value,
    color: '#38bdf8',
    lineWidth: 2,
    lineStyle: 2,
    axisLabelVisible: true,
    title: t('tradingWindow.binanceKlineReference'),
  });
}

function handleCrosshairMove(params: MouseEventParams<Time>): void {
  if (!params.point || !params.time || !series.value || !chartEl.value) {
    tooltip.value.visible = false;
    return;
  }
  const item = params.seriesData.get(series.value);
  if (!item || !('open' in item)) {
    tooltip.value.visible = false;
    return;
  }
  const candle = item as CandlestickData<Time>;
  const tooltipWidth = 220;
  tooltip.value = {
    visible: true,
    left: Math.min(params.point.x + 12, Math.max(0, chartEl.value.clientWidth - tooltipWidth - 8)),
    top: Math.max(8, params.point.y - 40),
    time: formatDateTime(Number(params.time) * 1000),
    open: formatMarketPrice(candle.open),
    high: formatMarketPrice(candle.high),
    low: formatMarketPrice(candle.low),
    close: formatMarketPrice(candle.close),
  };
}

function resizeChart(): void {
  if (!chart.value || !chartEl.value) return;
  chart.value.resize(
    Math.max(1, chartEl.value.clientWidth),
    Math.max(1, chartEl.value.clientHeight),
  );
}

function formatSymbol(symbol: string): string {
  return symbol.endsWith('USDT') ? `${symbol.slice(0, -4)}/USDT` : symbol;
}

function formatMarketPrice(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const absolute = Math.abs(value);
  const maximumFractionDigits = absolute >= 1_000 ? 2 : absolute >= 1 ? 5 : 8;
  return new Intl.NumberFormat(getCurrentIntlLocale(), {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
}

function formatAxisTime(time: Time): string {
  return new Intl.DateTimeFormat(getCurrentIntlLocale(), {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(Number(time) * 1000));
}

function formatDateTime(timeMs: number): string {
  return new Intl.DateTimeFormat(getCurrentIntlLocale(), {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timeMs));
}

function formatCountdown(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return [hours, minutes, remainingSeconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}

onMounted(() => {
  countdownTimer = setInterval(() => {
    nowMs.value = Date.now();
  }, 1_000);
  initChart();
  if (chartEl.value) {
    resizeObserver = new ResizeObserver(() => resizeChart());
    resizeObserver.observe(chartEl.value);
  }
});

onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer);
  resizeObserver?.disconnect();
  chart.value?.remove();
  chart.value = null;
  series.value = null;
  referencePriceLine.value = null;
});

watch([normalizedCandles, referenceOpen, currentLocale], async () => {
  await nextTick();
  initChart();
  chart.value?.applyOptions(
    createChartOptions(chartEl.value?.clientWidth ?? 1, chartEl.value?.clientHeight ?? 1),
  );
  renderChart();
});
</script>

<template>
  <section class="border-border bg-detail-bg flex h-full min-h-0 flex-col overflow-hidden border">
    <div class="border-border flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-2">
        <span
          class="inline-flex h-5 w-5 items-center justify-center"
          :title="statusLabel"
          :aria-label="statusLabel"
          role="status"
        >
          <span class="inline-block h-2 w-2 rounded-full" :class="statusDotClass" />
        </span>
        <h2 class="shrink-0 text-sm font-semibold text-white">{{ title }}</h2>
        <span class="border-border text-muted-light rounded border px-1.5 py-0.5 text-[10px]">
          {{ venueLabel }}
        </span>
      </div>
      <div class="flex min-w-0 shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span class="text-muted-light">
          {{ t('tradingWindow.binanceKlineReference') }}
          <span class="font-semibold text-sky-300 tabular-nums">
            {{ formatMarketPrice(referenceOpen) }}
          </span>
        </span>
        <span class="text-muted-light">
          {{ t('tradingWindow.binanceKlineCurrentPrice') }}
          <span class="font-semibold tabular-nums" :class="priceToneClass">
            {{ formatMarketPrice(currentPrice) }}
          </span>
        </span>
        <span class="font-semibold tabular-nums" :class="priceToneClass">{{ moveLabel }}</span>
        <span class="text-muted-light">
          {{ phaseLabel }}
          <span class="font-semibold tabular-nums" :class="priceToneClass">{{ phaseValue }}</span>
        </span>
        <LoadingSpinner v-if="loading" :title="t('tradingWindow.binanceKlineLoading')" />
      </div>
    </div>

    <div class="relative min-h-0 flex-1">
      <div ref="chartEl" class="h-full w-full" />
      <div
        v-if="tooltip.visible"
        class="border-border bg-surface/95 pointer-events-none absolute z-20 w-[220px] border px-3 py-2 text-xs shadow-xl"
        :style="{ left: `${tooltip.left}px`, top: `${tooltip.top}px` }"
      >
        <div class="text-muted mb-1 whitespace-nowrap">{{ tooltip.time }}</div>
        <div class="grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
          <span class="text-muted-light">O {{ tooltip.open }}</span>
          <span class="text-green-400">H {{ tooltip.high }}</span>
          <span class="text-red-400">L {{ tooltip.low }}</span>
          <span class="text-text">C {{ tooltip.close }}</span>
        </div>
      </div>
      <div
        v-if="!normalizedCandles.length && !loading"
        class="text-muted pointer-events-none absolute inset-0 flex items-center justify-center text-sm"
      >
        {{ binanceKline.error || t('tradingWindow.binanceKlineNoData') }}
      </div>
    </div>
  </section>
</template>
