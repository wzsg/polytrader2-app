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
  type WhitespaceData,
} from 'lightweight-charts';
import type { TradingMarketSnapshot } from '@polytrader/shared';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';
import { currentLocale, getCurrentIntlLocale } from '@/shared/i18n';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  cryptoTick: NonNullable<TradingMarketSnapshot['cryptoTick']>;
}>();

const { t } = useI18n();

type TickSeries = ISeriesApi<'Line'>;

const TICK_LINE_UP_COLOR = '#22c55e';
const TICK_LINE_DOWN_COLOR = '#ef4444';
const TICK_LINE_NEUTRAL_COLOR = '#8b8ba7';

const chartEl = ref<HTMLDivElement | null>(null);
const chart = shallowRef<IChartApi | null>(null);
const series = shallowRef<TickSeries | null>(null);
const tooltip = ref<{
  visible: boolean;
  left: number;
  top: number;
  time: string;
  price: string;
}>({
  visible: false,
  left: 0,
  top: 0,
  time: '',
  price: '',
});
const referenceLines = ref<
  Array<{
    key: 'start' | 'end';
    label: string;
    left: number;
    time: string;
  }>
>([]);
let resizeObserver: ResizeObserver | null = null;
let countdownTimer: ReturnType<typeof setInterval> | null = null;
const nowMs = ref(Date.now());

const sortedTicks = computed(() =>
  [...props.cryptoTick.ticks]
    .filter((tick) => Number.isFinite(tick.price) && Number.isFinite(Date.parse(tick.eventTime)))
    .sort((a, b) => Date.parse(a.eventTime) - Date.parse(b.eventTime)),
);

const latestTick = computed(() => props.cryptoTick.latestTick ?? sortedTicks.value.at(-1) ?? null);
const loading = computed(() => props.cryptoTick.status === 'loading');
const statusLabel = computed(() => {
  switch (props.cryptoTick.status) {
    case 'live':
      return t('tradingWindow.cryptoTickLive');
    case 'closed':
      return t('tradingWindow.cryptoTickClosed');
    case 'error':
      return t('tradingWindow.cryptoTickError');
    case 'loading':
      return t('tradingWindow.cryptoTickLoading');
    default:
      return t('tradingWindow.cryptoTickIdle');
  }
});
const statusClass = computed(() => {
  if (props.cryptoTick.status === 'live') return 'text-green-400';
  if (props.cryptoTick.status === 'error') return 'text-red-400';
  return 'text-muted-light';
});
const statusDotClass = computed(() => {
  if (props.cryptoTick.status === 'live') return 'bg-green-400';
  if (props.cryptoTick.status === 'error') return 'bg-red-400';
  return 'bg-muted';
});
const title = computed(() =>
  t('tradingWindow.cryptoTickTitle', { symbol: formatSymbol(props.cryptoTick.symbol) }),
);
const referenceTimes = computed(() => [
  {
    key: 'start' as const,
    time: props.cryptoTick.referenceStartTime,
  },
  {
    key: 'end' as const,
    time: props.cryptoTick.referenceEndTime,
  },
]);
const displayRange = computed(() => {
  const start = props.cryptoTick.displayStartTime;
  const end = props.cryptoTick.displayEndTime;
  if (!start || !end) return null;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) return null;
  return {
    from: Math.floor(startMs / 1000) as UTCTimestamp,
    to: Math.floor(endMs / 1000) as UTCTimestamp,
  };
});
const referenceStartPrice = computed(() =>
  findReferenceTickPrice(props.cryptoTick.referenceStartTime),
);
const referenceEndPrice = computed(() => findReferenceTickPrice(props.cryptoTick.referenceEndTime));
const latestTickPrice = computed(() => latestTick.value?.price ?? null);
const marketPhase = computed<'not-started' | 'live' | 'settling' | 'ended' | 'unknown'>(() => {
  const startMs = parseDateMs(props.cryptoTick.referenceStartTime);
  const endMs = parseDateMs(props.cryptoTick.referenceEndTime);
  const displayEndMs = parseDateMs(props.cryptoTick.displayEndTime);
  if (props.cryptoTick.status === 'closed') return 'ended';
  if (!startMs || !endMs || !displayEndMs) return 'unknown';
  if (nowMs.value < startMs) return 'not-started';
  if (nowMs.value < endMs) return 'live';
  if (referenceEndPrice.value !== null) return 'ended';
  if (nowMs.value < displayEndMs) return 'settling';
  return 'ended';
});
const comparisonPrice = computed(() => {
  if (marketPhase.value === 'ended') return referenceEndPrice.value;
  if (marketPhase.value === 'live' || marketPhase.value === 'settling')
    return latestTickPrice.value;
  return null;
});
const priceMove = computed(() => {
  if (referenceStartPrice.value === null || comparisonPrice.value === null) return null;
  return comparisonPrice.value - referenceStartPrice.value;
});
const priceMoveLabel = computed(() =>
  priceMove.value === null ? t('common.notAvailable') : formatSignedTickPrice(priceMove.value),
);
const priceMoveClass = computed(() => {
  if (priceMove.value === null || priceMove.value === 0) return 'text-muted-light';
  return priceMove.value > 0 ? 'text-green-400' : 'text-red-400';
});
const tickLineColor = computed(() => {
  if (priceMove.value === null || priceMove.value === 0) return TICK_LINE_NEUTRAL_COLOR;
  return priceMove.value > 0 ? TICK_LINE_UP_COLOR : TICK_LINE_DOWN_COLOR;
});
const phaseValueLabel = computed(() => {
  if (marketPhase.value === 'not-started') return t('tradingWindow.cryptoTickNotStarted');
  if (marketPhase.value === 'live') return countdownLabel.value;
  if (marketPhase.value === 'settling') return t('tradingWindow.cryptoTickSettling');
  if (marketPhase.value === 'ended') return resultLabel.value;
  return t('common.notAvailable');
});
const phaseValueClass = computed(() => {
  if (marketPhase.value === 'live')
    return countdownMs.value <= 30_000 ? 'text-amber-300' : 'text-sky-300';
  if (marketPhase.value === 'settling') return 'text-amber-300';
  if (marketPhase.value === 'ended') return resultClass.value;
  if (marketPhase.value === 'not-started') return 'text-muted-light';
  return 'text-muted-light';
});
const phaseLabel = computed(() => {
  if (marketPhase.value === 'live') return t('tradingWindow.cryptoTickCountdown');
  if (marketPhase.value === 'ended') return t('tradingWindow.cryptoTickResult');
  return t('tradingWindow.cryptoTickStatus');
});
const countdownMs = computed(() => {
  const endMs = parseDateMs(props.cryptoTick.referenceEndTime);
  if (!endMs) return 0;
  return Math.max(0, endMs - nowMs.value);
});
const countdownLabel = computed(() => formatCountdown(countdownMs.value));
const resultLabel = computed(() => {
  if (priceMove.value === null) return t('tradingWindow.cryptoTickSettling');
  if (priceMove.value > 0) return t('tradingWindow.cryptoTickResultUp');
  if (priceMove.value < 0) return t('tradingWindow.cryptoTickResultDown');
  return t('tradingWindow.cryptoTickResultFlat');
});
const resultClass = computed(() => {
  if (priceMove.value === null || priceMove.value === 0) return 'text-muted-light';
  return priceMove.value > 0 ? 'text-green-400' : 'text-red-400';
});

function formatSymbol(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();
  if (normalized.endsWith('USD')) return `${normalized.slice(0, -3)}/USD`;
  return normalized || t('common.unknown');
}

function formatTickPrice(value: number): string {
  return new Intl.NumberFormat(getCurrentIntlLocale(), {
    maximumFractionDigits: value >= 100 ? 2 : 6,
  }).format(value);
}

function formatSignedTickPrice(value: number): string {
  const formatted = new Intl.NumberFormat(getCurrentIntlLocale(), {
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

function formatCountdown(value: number): string {
  const totalSeconds = Math.max(0, Math.ceil(value / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatAxisTime(value: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(getCurrentIntlLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t('common.notAvailable');
  return new Intl.DateTimeFormat(getCurrentIntlLocale(), {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function lightweightTimeToMs(time: Time): number {
  if (typeof time === 'number') return time * 1000;
  if (typeof time === 'string') return new Date(time).getTime();
  return Date.UTC(time.year, time.month - 1, time.day);
}

function toUtcTimestamp(value: string): UTCTimestamp {
  return Math.floor(Date.parse(value) / 1000) as UTCTimestamp;
}

function parseDateMs(value: string | null): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function findReferenceTickPrice(referenceTime: string | null): number | null {
  const referenceMs = parseDateMs(referenceTime);
  if (!referenceMs) return null;

  let previousPrice: number | null = null;
  for (const tick of sortedTicks.value) {
    const tickMs = Date.parse(tick.eventTime);
    if (!Number.isFinite(tickMs)) continue;
    if (tickMs >= referenceMs) return tick.price;
    previousPrice = tick.price;
  }

  const latestMs = latestTick.value ? Date.parse(latestTick.value.eventTime) : null;
  if (!latestMs || !Number.isFinite(latestMs) || latestMs < referenceMs) return null;
  return previousPrice;
}

function findReferencePrice(referenceTime: string | null): string {
  const price = findReferenceTickPrice(referenceTime);
  return price === null ? '' : formatTickPrice(price);
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
      vertLines: { color: 'rgba(42, 42, 62, 0.22)' },
      horzLines: { color: '#242438' },
    },
    rightPriceScale: {
      borderColor: '#2a2a3e',
      scaleMargins: { top: 0.22, bottom: 0.16 },
    },
    timeScale: {
      borderColor: '#2a2a3e',
      timeVisible: true,
      secondsVisible: true,
      rightBarStaysOnScroll: true,
      shiftVisibleRangeOnNewBar: false,
      fixLeftEdge: true,
      fixRightEdge: true,
      tickMarkFormatter: (time: Time) => formatAxisTime(lightweightTimeToMs(time)),
    },
    handleScale: false,
    handleScroll: false,
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: '#22c55e', labelBackgroundColor: '#16a34a' },
      horzLine: { color: '#22c55e', labelBackgroundColor: '#16a34a' },
    },
    localization: {
      locale: getCurrentIntlLocale(),
      timeFormatter: (time: Time) =>
        formatDateTime(new Date(lightweightTimeToMs(time)).toISOString()),
      priceFormatter: (price: number) => formatTickPrice(price),
    },
  };
}

function buildLineData(): Array<LineData<Time> | WhitespaceData<Time>> {
  const byTime = new Map<number, number>();
  for (const tick of sortedTicks.value) {
    byTime.set(toUtcTimestamp(tick.eventTime), tick.price);
  }
  const data: Array<LineData<Time> | WhitespaceData<Time>> = [...byTime.entries()].map(
    ([time, value]) => ({ time: time as UTCTimestamp, value }),
  );
  const range = displayRange.value;
  if (range) {
    if (!byTime.has(range.from)) data.push({ time: range.from });
    if (!byTime.has(range.to)) data.push({ time: range.to });
  }
  return data.sort((a, b) => lightweightTimeToMs(a.time) - lightweightTimeToMs(b.time));
}

function initChart(): void {
  if (!chartEl.value || chart.value) return;
  const { clientWidth, clientHeight } = chartEl.value;
  chart.value = createChart(
    chartEl.value,
    createChartOptions(Math.max(1, clientWidth), Math.max(1, clientHeight)),
  );
  series.value = chart.value.addSeries(LineSeries, {
    color: tickLineColor.value,
    lineWidth: 2,
    lastValueVisible: true,
    priceLineVisible: true,
    crosshairMarkerVisible: true,
    crosshairMarkerRadius: 4,
  });
  chart.value.subscribeCrosshairMove(handleCrosshairMove);
  chart.value.timeScale().subscribeVisibleTimeRangeChange(updateReferenceLines);
  renderChart();
}

function updateChartOptions(): void {
  if (!chart.value) return;
  chart.value.applyOptions(
    createChartOptions(chartEl.value?.clientWidth ?? 1, chartEl.value?.clientHeight ?? 1),
  );
  updateSeriesOptions();
}

function updateSeriesOptions(): void {
  series.value?.applyOptions({
    color: tickLineColor.value,
    priceLineColor: tickLineColor.value,
  });
}

function renderChart(): void {
  if (!chart.value || !series.value) return;
  updateSeriesOptions();
  series.value.setData(buildLineData());
  applyDisplayRange();
  updateReferenceLines();
}

function applyDisplayRange(): void {
  if (!chart.value) return;
  const range = displayRange.value;
  if (range) {
    try {
      chart.value.timeScale().setVisibleRange(range);
    } catch {
      chart.value.timeScale().fitContent();
    }
    return;
  }
  if (sortedTicks.value.length) chart.value.timeScale().fitContent();
}

function resizeChart(): void {
  if (!chart.value || !chartEl.value) return;
  const { clientWidth, clientHeight } = chartEl.value;
  chart.value.resize(Math.max(1, clientWidth), Math.max(1, clientHeight));
  updateReferenceLines();
}

function updateReferenceLines(): void {
  if (!chart.value || !chartEl.value) {
    referenceLines.value = [];
    return;
  }
  const width = chartEl.value.clientWidth;
  referenceLines.value = referenceTimes.value.flatMap((item) => {
    const time = item.time ? toUtcTimestamp(item.time) : null;
    const left = time ? chart.value?.timeScale().timeToCoordinate(time) : null;
    if (left === null || left === undefined || !Number.isFinite(left)) return [];
    if (left < 0 || left > width) return [];
    const label = findReferencePrice(item.time);
    return [
      {
        key: item.key,
        label,
        left,
        time: formatDateTime(item.time ?? ''),
      },
    ];
  });
}

function handleCrosshairMove(params: MouseEventParams<Time>): void {
  if (!params.point || !params.time || !chartEl.value || !series.value) {
    tooltip.value.visible = false;
    return;
  }
  const item = params.seriesData.get(series.value);
  if (!item || !('value' in item)) {
    tooltip.value.visible = false;
    return;
  }
  const width = chartEl.value.clientWidth;
  const tooltipWidth = 210;
  tooltip.value = {
    visible: true,
    left: Math.min(params.point.x + 12, Math.max(0, width - tooltipWidth - 8)),
    top: Math.max(8, params.point.y - 12),
    time: formatDateTime(new Date(lightweightTimeToMs(params.time)).toISOString()),
    price: formatTickPrice(item.value),
  };
}

onMounted(() => {
  countdownTimer = setInterval(() => {
    nowMs.value = Date.now();
  }, 1000);
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
  if (countdownTimer) clearInterval(countdownTimer);
  resizeObserver?.disconnect();
  chart.value?.timeScale().unsubscribeVisibleTimeRangeChange(updateReferenceLines);
  chart.value?.remove();
  chart.value = null;
  series.value = null;
});

watch(
  [sortedTicks, currentLocale, referenceTimes, displayRange, tickLineColor],
  async () => {
    await nextTick();
    initChart();
    updateChartOptions();
    renderChart();
  },
  { deep: true },
);
</script>

<template>
  <section class="border-border bg-detail-bg flex h-full min-h-0 flex-col overflow-hidden border">
    <div class="border-border flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-2">
        <h2 class="shrink-0 text-sm font-semibold text-white">{{ title }}</h2>
        <span class="inline-flex items-center gap-1.5 text-xs" :class="statusClass">
          <span class="inline-block h-1.5 w-1.5 rounded-full" :class="statusDotClass" />
          {{ statusLabel }}
        </span>
      </div>
      <div class="flex min-w-0 shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span class="text-muted-light">
          {{ t('tradingWindow.cryptoTickMove') }}
          <span class="font-semibold tabular-nums" :class="priceMoveClass">
            {{ priceMoveLabel }}
          </span>
        </span>
        <span class="text-muted-light">
          {{ phaseLabel }}
          <span class="font-semibold tabular-nums" :class="phaseValueClass">
            {{ phaseValueLabel }}
          </span>
        </span>
        <LoadingSpinner v-if="loading" :title="t('tradingWindow.cryptoTickLoading')" />
      </div>
    </div>

    <div class="relative min-h-0 flex-1">
      <div ref="chartEl" class="h-full w-full" />
      <div
        v-for="line in referenceLines"
        :key="line.key"
        class="pointer-events-none absolute top-0 bottom-0 z-10 border-l"
        :class="line.key === 'start' ? 'border-sky-400/80' : 'border-amber-300/80'"
        :style="{ left: `${line.left}px` }"
      >
        <div
          v-if="line.label"
          class="absolute top-2 whitespace-nowrap border px-2 py-1 text-[11px] leading-none shadow-lg"
          :class="
            line.key === 'start'
              ? 'left-2 border-sky-400/40 bg-sky-950/90 text-sky-100'
              : 'right-2 border-amber-300/40 bg-amber-950/90 text-amber-100'
          "
          :title="line.time"
        >
          {{ line.label }}
        </div>
      </div>
      <div
        v-if="tooltip.visible"
        class="border-border bg-surface/95 pointer-events-none absolute z-20 w-[210px] border px-3 py-2 text-xs shadow-xl"
        :style="{ left: `${tooltip.left}px`, top: `${tooltip.top}px` }"
      >
        <div class="text-muted mb-1 whitespace-nowrap">{{ tooltip.time }}</div>
        <div class="flex items-center justify-between gap-3">
          <span class="text-text">{{ t('common.price') }}</span>
          <span class="text-primary-light font-semibold tabular-nums">{{ tooltip.price }}</span>
        </div>
      </div>
      <div
        v-if="!sortedTicks.length && !loading"
        class="text-muted pointer-events-none absolute inset-0 flex items-center justify-center text-sm"
      >
        {{ cryptoTick.error || t('tradingWindow.cryptoTickNoData') }}
      </div>
    </div>
  </section>
</template>
