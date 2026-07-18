<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { CircleHelp, UserRound } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import type { OrderFilledActivitySnapshot, OrderFilledActivityTrade } from '@polytrader/shared';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';
import {
  formatAddress,
  formatNumber,
  formatPrice,
  formatRelativeElapsedTime,
  formatTimestamp,
  formatUsd,
  sideClass,
  sideLabel,
} from '@/shared/utils/format';

interface AmountPreset {
  value: string | null;
  labelKey: string;
}

const amountPresets: AmountPreset[] = [
  { value: null, labelKey: 'liveTrades.allTrades' },
  { value: '1000', labelKey: 'liveTrades.amount1k' },
  { value: '5000', labelKey: 'liveTrades.amount5k' },
  { value: '10000', labelKey: 'liveTrades.amount10k' },
  { value: '50000', labelKey: 'liveTrades.amount50k' },
  { value: '100000', labelKey: 'liveTrades.amount100k' },
];

const { t } = useI18n();
const snapshot = ref<OrderFilledActivitySnapshot | null>(null);
const error = ref('');
const selectedMinAmount = ref<string | null>('1000');
const customMinAmount = ref('');
const renderedTrades = ref<OrderFilledActivityTrade[]>([]);
const pendingTrades = ref<OrderFilledActivityTrade[]>([]);
const isHydratingTrades = ref(true);
const isTradeTableAtTop = ref(true);
const shouldAnimateTradeEntries = ref(false);
const tradeTableScroller = ref<HTMLDivElement | null>(null);
let unsubscribeUpdated: (() => void) | null = null;
let relativeTimeTimer: ReturnType<typeof setInterval> | null = null;
let pendingTradeFlushTimer: ReturnType<typeof setTimeout> | null = null;
const relativeTimeNow = ref(Date.now());

const status = computed(() => snapshot.value?.status ?? 'idle');
const showInitialLoading = computed(
  () => isHydratingTrades.value && !renderedTrades.value.length && status.value !== 'error',
);
const statusLabel = computed(() => t(`liveTrades.status.${status.value}`));
const statusClass = computed(() => {
  if (status.value === 'live') return 'bg-green-400';
  if (status.value === 'error') return 'bg-red-400';
  if (status.value === 'idle') return 'bg-muted';
  return 'bg-yellow-400';
});

function filterButtonClass(value: string | null): string {
  return selectedMinAmount.value === value
    ? 'border-primary/60 bg-primary/20 text-primary-light'
    : 'border-border bg-btn-secondary text-muted-light hover:bg-btn-secondary-hover hover:text-text';
}

async function startActivity(minTradeAmount: string | null): Promise<void> {
  resetTradeDisplay();
  error.value = '';
  try {
    const result = await window.api.orderfilledActivity.start({ minTradeAmount });
    if (!result.ok) {
      error.value = result.error;
      isHydratingTrades.value = false;
      return;
    }
    applyActivitySnapshot(result.data);
  } catch (startError) {
    error.value = startError instanceof Error ? startError.message : String(startError);
    isHydratingTrades.value = false;
  }
}

function selectPreset(value: string | null): void {
  if (selectedMinAmount.value === value && !customMinAmount.value) return;
  selectedMinAmount.value = value;
  customMinAmount.value = '';
  void startActivity(value);
}

function applyCustomAmount(): void {
  const value = customMinAmount.value.trim();
  if (!value) {
    selectPreset(null);
    return;
  }
  selectedMinAmount.value = value;
  void startActivity(value);
}

async function openTrader(trade: OrderFilledActivityTrade): Promise<void> {
  if (!trade.traderAddress) return;
  try {
    await window.api.openPublicTraderWindow({ address: trade.traderAddress });
  } catch (openError) {
    error.value = openError instanceof Error ? openError.message : String(openError);
  }
}

async function openMarket(trade: OrderFilledActivityTrade): Promise<void> {
  const conditionId = trade.market?.conditionId;
  if (!conditionId) return;
  try {
    const result = await window.api.orderfilledActivity.openMarket({
      conditionId,
      tokenId: trade.tokenId,
      outcome: trade.market?.outcome,
    });
    if (!result.ok) error.value = result.error;
  } catch (openError) {
    error.value = openError instanceof Error ? openError.message : String(openError);
  }
}

function marketTitle(trade: OrderFilledActivityTrade): string {
  return trade.market?.question || t('liveTrades.unknownMarket');
}

function amountLabel(value: string | null): string {
  if (value === null) return t('liveTrades.allTrades');
  return formatUsd(value);
}

function sortTrades(trades: OrderFilledActivityTrade[]): OrderFilledActivityTrade[] {
  return [...trades].sort((left, right) => {
    if (right.blockNumber !== left.blockNumber) return right.blockNumber - left.blockNumber;
    return right.logIndex - left.logIndex;
  });
}

function resetTradeDisplay(): void {
  if (pendingTradeFlushTimer) clearTimeout(pendingTradeFlushTimer);
  pendingTradeFlushTimer = null;
  renderedTrades.value = [];
  pendingTrades.value = [];
  isHydratingTrades.value = true;
  isTradeTableAtTop.value = true;
  shouldAnimateTradeEntries.value = false;
}

function applyActivitySnapshot(nextSnapshot: OrderFilledActivitySnapshot): void {
  snapshot.value = nextSnapshot;
  if (isHydratingTrades.value) {
    renderedTrades.value = sortTrades(nextSnapshot.trades);
    if (nextSnapshot.status === 'live' || nextSnapshot.status === 'error') {
      isHydratingTrades.value = false;
      shouldAnimateTradeEntries.value = true;
    }
    return;
  }

  const incomingIds = new Set(nextSnapshot.trades.map((trade) => trade.id));
  renderedTrades.value = renderedTrades.value.filter((trade) => incomingIds.has(trade.id));
  pendingTrades.value = pendingTrades.value.filter((trade) => incomingIds.has(trade.id));

  const knownIds = new Set([
    ...renderedTrades.value.map((trade) => trade.id),
    ...pendingTrades.value.map((trade) => trade.id),
  ]);
  const additions = nextSnapshot.trades.filter((trade) => !knownIds.has(trade.id));
  if (!additions.length) return;

  pendingTrades.value = sortTrades([...pendingTrades.value, ...additions]);
  schedulePendingTradeFlush();
}

function schedulePendingTradeFlush(): void {
  if (!isTradeTableAtTop.value || !pendingTrades.value.length || pendingTradeFlushTimer) return;
  pendingTradeFlushTimer = setTimeout(() => {
    pendingTradeFlushTimer = null;
    if (isTradeTableAtTop.value) flushPendingTrades();
  }, 400);
}

function flushPendingTrades(): void {
  if (!pendingTrades.value.length) return;
  renderedTrades.value = sortTrades([...pendingTrades.value, ...renderedTrades.value]);
  pendingTrades.value = [];
}

function handleTradeTableScroll(event: Event): void {
  const target = event.currentTarget as HTMLDivElement;
  isTradeTableAtTop.value = target.scrollTop <= 8;
  if (isTradeTableAtTop.value) schedulePendingTradeFlush();
}

onMounted(() => {
  relativeTimeTimer = setInterval(() => {
    relativeTimeNow.value = Date.now();
  }, 1_000);
  unsubscribeUpdated = window.api.orderfilledActivity.onUpdated((nextSnapshot) => {
    applyActivitySnapshot(nextSnapshot);
  });
  void startActivity(selectedMinAmount.value);
});

onUnmounted(() => {
  unsubscribeUpdated?.();
  if (relativeTimeTimer) clearInterval(relativeTimeTimer);
  if (pendingTradeFlushTimer) clearTimeout(pendingTradeFlushTimer);
  relativeTimeTimer = null;
  pendingTradeFlushTimer = null;
  void window.api.orderfilledActivity.stop();
});
</script>

<template>
  <div class="border-border bg-surface flex shrink-0 items-center gap-3 border-b px-6 py-3.5">
    <div
      class="scrollbar-hidden flex min-w-0 flex-1 items-center gap-2 overflow-x-auto whitespace-nowrap"
    >
      <button
        v-for="preset in amountPresets"
        :key="preset.value || 'all'"
        type="button"
        class="inline-flex h-8 shrink-0 items-center rounded-md border px-3 text-sm font-medium transition-colors"
        :class="filterButtonClass(preset.value)"
        :aria-pressed="selectedMinAmount === preset.value && !customMinAmount"
        @click="selectPreset(preset.value)"
      >
        {{ t(preset.labelKey) }}
      </button>
      <form class="flex shrink-0 items-center gap-2" @submit.prevent="applyCustomAmount">
        <input
          v-model="customMinAmount"
          type="text"
          inputmode="decimal"
          class="border-border bg-background text-text placeholder:text-muted focus:border-primary/70 h-8 w-28 rounded-md border px-2.5 text-sm transition-colors outline-none"
          :placeholder="t('liveTrades.customAmount')"
          :aria-label="t('liveTrades.customAmount')"
        />
        <button
          type="submit"
          class="border-border bg-btn-secondary text-text hover:bg-btn-secondary-hover inline-flex h-8 items-center rounded-md border px-3 text-sm transition-colors"
        >
          {{ t('liveTrades.apply') }}
        </button>
      </form>
    </div>
    <div class="ml-auto flex shrink-0 items-center gap-3">
      <span
        class="text-muted-light inline-flex items-center gap-2 text-xs font-medium"
        :title="statusLabel"
      >
        <span class="h-2 w-2 rounded-full" :class="statusClass" />
        {{ statusLabel }}
      </span>
    </div>
  </div>

  <div
    v-if="error || snapshot?.error"
    class="border-border bg-surface shrink-0 border-b px-6 py-2 text-sm text-red-400"
  >
    {{ error || snapshot?.error }}
  </div>

  <div v-if="showInitialLoading" class="flex min-h-0 flex-1 items-center justify-center">
    <LoadingSpinner :size="20" :title="t('liveTrades.loadTrades')" />
  </div>
  <div
    v-else
    ref="tradeTableScroller"
    class="min-h-0 flex-1 overflow-auto"
    @scroll="handleTradeTableScroll"
  >
    <table class="w-full min-w-[1080px] border-collapse">
      <thead class="bg-surface sticky top-0 z-10">
        <tr>
          <th
            class="border-border bg-surface text-muted w-20 border-b px-2 py-2.5 text-left text-xs font-semibold tracking-wide uppercase"
          >
            {{ t('liveTrades.time') }}
          </th>
          <th
            class="border-border bg-surface text-muted min-w-80 border-b px-4 py-2.5 text-left text-xs font-semibold tracking-wide uppercase"
          >
            {{ t('liveTrades.market') }}
          </th>
          <th
            class="border-border bg-surface text-muted w-48 border-b px-4 py-2.5 text-left text-xs font-semibold tracking-wide uppercase"
          >
            {{ t('liveTrades.outcome') }}
          </th>
          <th
            class="border-border bg-surface text-muted w-24 border-b px-4 py-2.5 text-left text-xs font-semibold tracking-wide uppercase"
          >
            {{ t('liveTrades.direction') }}
          </th>
          <th
            class="border-border bg-surface text-muted w-24 border-b px-4 py-2.5 text-right text-xs font-semibold tracking-wide uppercase"
          >
            {{ t('liveTrades.price') }}
          </th>
          <th
            class="border-border bg-surface text-muted w-32 border-b px-4 py-2.5 text-right text-xs font-semibold tracking-wide uppercase"
          >
            {{ t('liveTrades.shares') }}
          </th>
          <th
            class="border-border bg-surface text-muted w-36 border-b px-4 py-2.5 text-right text-xs font-semibold tracking-wide uppercase"
          >
            {{ t('liveTrades.amount') }}
          </th>
          <th
            class="border-border bg-surface text-muted w-32 border-b px-4 py-2.5 text-left text-xs font-semibold tracking-wide uppercase"
          >
            {{ t('liveTrades.trader') }}
          </th>
        </tr>
      </thead>
      <tbody v-if="!renderedTrades.length">
        <tr>
          <td colspan="8" class="text-muted px-4 py-12 text-center text-sm">
            {{ t('liveTrades.noTrades', { amount: amountLabel(selectedMinAmount) }) }}
          </td>
        </tr>
      </tbody>
      <TransitionGroup v-else tag="tbody" :name="shouldAnimateTradeEntries ? 'live-trade' : ''">
        <tr
          v-for="trade in renderedTrades"
          :key="trade.id"
          class="border-border/60 border-b hover:bg-[#1a1a2e]"
        >
          <td
            class="text-muted w-20 px-2 py-3 text-xs whitespace-nowrap tabular-nums"
            :title="formatTimestamp(trade.timestamp)"
          >
            {{ formatRelativeElapsedTime(trade.timestamp, relativeTimeNow) }}
          </td>
          <td class="px-4 py-3">
            <button
              type="button"
              class="group flex min-w-0 cursor-pointer items-center gap-2.5 text-left disabled:cursor-default"
              :class="{ 'cursor-default': !trade.market?.conditionId }"
              :disabled="!trade.market?.conditionId"
              :title="marketTitle(trade)"
              @click="openMarket(trade)"
            >
              <img
                v-if="trade.market?.icon || trade.market?.image"
                :src="trade.market.icon || trade.market.image || ''"
                alt=""
                class="border-border h-8 w-8 shrink-0 rounded-md border object-cover"
              />
              <span
                v-else
                class="bg-btn-secondary text-muted border-border inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border"
              >
                <CircleHelp :size="15" />
              </span>
              <span
                class="text-text group-hover:text-primary-light min-w-0 truncate text-sm font-medium"
              >
                {{ marketTitle(trade) }}
              </span>
            </button>
          </td>
          <td class="text-text px-4 py-3 text-sm">
            <span class="block truncate" :title="trade.market?.outcome || ''">
              {{ trade.market?.outcome || '—' }}
            </span>
          </td>
          <td class="px-4 py-3 text-sm font-medium" :class="sideClass(trade.direction)">
            {{ sideLabel(trade.direction) }}
          </td>
          <td class="text-text px-4 py-3 text-right text-sm tabular-nums">
            {{ formatPrice(trade.price) }}
          </td>
          <td class="text-text px-4 py-3 text-right text-sm tabular-nums">
            {{ formatNumber(trade.volume, 2) }}
          </td>
          <td class="text-text px-4 py-3 text-right text-sm font-medium tabular-nums">
            {{ formatUsd(trade.amount) }}
          </td>
          <td class="px-4 py-3">
            <button
              type="button"
              class="group flex min-w-0 cursor-pointer items-center gap-2 text-left disabled:cursor-default"
              :class="{ 'cursor-default': !trade.traderAddress }"
              :disabled="!trade.traderAddress"
              :title="trade.traderAddress || ''"
              @click="openTrader(trade)"
            >
              <span
                class="bg-btn-secondary text-muted border-border inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border"
              >
                <UserRound :size="14" />
              </span>
              <span
                class="text-text group-hover:text-primary-light min-w-0 truncate font-mono text-xs"
              >
                {{ formatAddress(trade.traderAddress) }}
              </span>
            </button>
          </td>
        </tr>
      </TransitionGroup>
    </table>
  </div>
</template>

<style scoped>
.live-trade-enter-active,
.live-trade-move {
  transition:
    opacity 220ms ease,
    transform 220ms ease;
}

.live-trade-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
