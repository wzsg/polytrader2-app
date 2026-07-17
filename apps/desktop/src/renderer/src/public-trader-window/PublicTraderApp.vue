<script setup lang="ts">
import { RefreshCw, UserRound } from '@lucide/vue';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type {
  PublicTraderPosition,
  PublicTraderProfile,
  PublicTraderTrade,
} from '@polytrader/shared';
import TitleBar from '@/shared/components/TitleBar.vue';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';
import {
  formatAddress,
  formatNumber,
  formatPercent,
  formatPnl,
  formatPrice,
  formatRelativeTime,
  formatTimestamp,
  formatUsd,
} from '@/shared/utils/format';

const PAGE_SIZE = 100;

const { t } = useI18n();
const address = new URLSearchParams(window.location.search).get('address')?.trim() ?? '';
const activeTab = ref<'positions' | 'trades'>('positions');
const profile = ref<PublicTraderProfile | null>(null);
const positions = ref<PublicTraderPosition[]>([]);
const trades = ref<PublicTraderTrade[]>([]);
const pending = ref(true);
const error = ref('');
const loadingMorePositions = ref(false);
const loadingMoreTrades = ref(false);
const hasMorePositions = ref(false);
const hasMoreTrades = ref(false);
const profileImageFailed = ref(false);
const activityNow = ref(Date.now());
let activityTimerId: number | undefined;

const displayName = computed(() => {
  const current = profile.value;
  return current?.name || current?.pseudonym || formatAddress(address);
});
const recentActivity = computed(() => {
  const timestamp = trades.value[0]?.timestamp;
  if (timestamp == null) return null;
  return {
    absolute: formatTimestamp(timestamp),
    relative: formatRelativeTime(timestamp, activityNow.value),
  };
});

function errorMessage(input: unknown): string {
  return input instanceof Error ? input.message : String(input);
}

function loadError(result: { ok: false; error: string }): void {
  error.value = result.error || t('common.loadFailed');
}

async function loadTrader(): Promise<void> {
  pending.value = true;
  error.value = '';
  try {
    const [profileResult, positionsResult, tradesResult] = await Promise.all([
      window.api.getPublicTraderProfile(address),
      window.api.listPublicTraderPositions({ address, limit: PAGE_SIZE, offset: 0 }),
      window.api.listPublicTraderTrades({ address, limit: PAGE_SIZE, offset: 0 }),
    ]);
    if (!profileResult.ok) return loadError(profileResult);
    if (!positionsResult.ok) return loadError(positionsResult);
    if (!tradesResult.ok) return loadError(tradesResult);

    profile.value = profileResult.data;
    profileImageFailed.value = false;
    positions.value = positionsResult.data.entries;
    trades.value = tradesResult.data.entries;
    hasMorePositions.value = positionsResult.data.entries.length === PAGE_SIZE;
    hasMoreTrades.value = tradesResult.data.entries.length === PAGE_SIZE;
  } catch (loadErrorInput) {
    error.value = errorMessage(loadErrorInput);
  } finally {
    pending.value = false;
  }
}

async function loadMorePositions(): Promise<void> {
  if (loadingMorePositions.value || !hasMorePositions.value) return;
  loadingMorePositions.value = true;
  try {
    const result = await window.api.listPublicTraderPositions({
      address,
      limit: PAGE_SIZE,
      offset: positions.value.length,
    });
    if (!result.ok) return loadError(result);
    positions.value.push(...result.data.entries);
    hasMorePositions.value = result.data.entries.length === PAGE_SIZE;
  } catch (loadErrorInput) {
    error.value = errorMessage(loadErrorInput);
  } finally {
    loadingMorePositions.value = false;
  }
}

async function loadMoreTrades(): Promise<void> {
  if (loadingMoreTrades.value || !hasMoreTrades.value) return;
  loadingMoreTrades.value = true;
  try {
    const result = await window.api.listPublicTraderTrades({
      address,
      limit: PAGE_SIZE,
      offset: trades.value.length,
    });
    if (!result.ok) return loadError(result);
    trades.value.push(...result.data.entries);
    hasMoreTrades.value = result.data.entries.length === PAGE_SIZE;
  } catch (loadErrorInput) {
    error.value = errorMessage(loadErrorInput);
  } finally {
    loadingMoreTrades.value = false;
  }
}

async function openMarket(input: PublicTraderPosition | PublicTraderTrade): Promise<void> {
  const result = await window.api.openPublicTraderMarket({
    conditionId: input.conditionId,
    asset: input.asset,
    outcome: input.outcome,
  });
  if (!result.ok) error.value = result.error;
}

function hideBrokenImage(event: Event): void {
  const target = event.currentTarget;
  if (target instanceof HTMLImageElement) target.style.display = 'none';
}

function handleProfileImageError(): void {
  profileImageFailed.value = true;
}

function rowKey(input: PublicTraderPosition | PublicTraderTrade, index: number): string {
  return `${input.conditionId}:${input.asset}:${'timestamp' in input ? input.timestamp : index}`;
}

onMounted(() => {
  activityTimerId = window.setInterval(() => {
    activityNow.value = Date.now();
  }, 60_000);
  void loadTrader();
});

onUnmounted(() => {
  if (activityTimerId !== undefined) window.clearInterval(activityTimerId);
});
</script>

<template>
  <div class="flex h-full flex-col">
    <TitleBar title="Polytrader2" :subtitle="displayName" show-brand-icon />

    <main class="bg-main min-h-0 flex-1 overflow-auto p-5">
      <div v-if="pending" class="flex h-full min-h-64 items-center justify-center">
        <LoadingSpinner :size="22" :title="t('publicTrader.loadTrader')" />
      </div>

      <div
        v-else-if="error && !profile"
        class="flex h-full min-h-64 items-center justify-center px-6 text-sm text-red-400"
      >
        {{ error }}
      </div>

      <div v-else class="mx-auto flex min-h-full max-w-[1500px] flex-col gap-4">
        <section class="border-border bg-detail-bg rounded-lg border p-5">
          <div class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div class="flex min-w-0 gap-4">
              <img
                v-if="profile?.profileImage && !profileImageFailed"
                :src="profile.profileImage"
                alt=""
                class="border-border h-14 w-14 shrink-0 rounded-full border object-cover"
                @error="handleProfileImageError"
              />
              <span
                v-else
                class="bg-btn-secondary text-muted border-border inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full border"
              >
                <UserRound :size="24" />
              </span>
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <h1 class="text-xl font-semibold text-white">{{ displayName }}</h1>
                  <span
                    v-if="profile?.verifiedBadge"
                    class="border-primary/50 bg-primary/15 text-primary-light rounded border px-1.5 py-0.5 text-[11px] font-medium"
                  >
                    ✓
                  </span>
                </div>
                <p class="text-muted mt-1 font-mono text-sm" :title="address">
                  {{ formatAddress(address) }}
                </p>
                <p v-if="profile?.xUsername" class="text-muted mt-1 text-sm">
                  @{{ profile.xUsername }}
                </p>
                <p class="text-muted mt-3 text-sm">
                  {{ t('publicTrader.recentActivity') }}
                  <span class="text-text ml-1.5 tabular-nums">{{
                    recentActivity?.absolute ?? '—'
                  }}</span>
                  <span v-if="recentActivity" class="ml-1.5">
                    ({{ recentActivity.relative }})
                  </span>
                </p>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3 lg:min-w-64">
              <div class="border-border bg-surface rounded-md border px-3 py-2.5">
                <p class="text-muted text-xs">{{ t('publicTrader.positionValue') }}</p>
                <p class="text-text mt-1 text-base font-semibold tabular-nums">
                  {{
                    profile?.totalPositionValue == null
                      ? '—'
                      : formatUsd(profile.totalPositionValue)
                  }}
                </p>
              </div>
              <div class="border-border bg-surface rounded-md border px-3 py-2.5">
                <p class="text-muted text-xs">{{ t('publicTrader.tradedMarkets') }}</p>
                <p class="text-text mt-1 text-base font-semibold tabular-nums">
                  {{
                    profile?.tradedMarkets == null ? '—' : formatNumber(profile.tradedMarkets, 0)
                  }}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          class="border-border bg-detail-bg min-h-0 flex-1 overflow-hidden rounded-lg border"
        >
          <div class="border-border flex items-center justify-between border-b px-4 py-3">
            <div class="flex gap-1">
              <button
                type="button"
                class="rounded px-3 py-1.5 text-sm font-medium transition-colors"
                :class="
                  activeTab === 'positions'
                    ? 'bg-primary/20 text-primary-light'
                    : 'text-muted hover:bg-btn-secondary hover:text-text'
                "
                @click="activeTab = 'positions'"
              >
                {{ t('publicTrader.positions') }}
              </button>
              <button
                type="button"
                class="rounded px-3 py-1.5 text-sm font-medium transition-colors"
                :class="
                  activeTab === 'trades'
                    ? 'bg-primary/20 text-primary-light'
                    : 'text-muted hover:bg-btn-secondary hover:text-text'
                "
                @click="activeTab = 'trades'"
              >
                {{ t('publicTrader.trades') }}
              </button>
            </div>
            <button
              type="button"
              class="text-muted hover:bg-btn-secondary hover:text-text inline-flex h-8 w-8 items-center justify-center rounded transition-colors"
              :title="t('publicTrader.refreshTrader')"
              :aria-label="t('publicTrader.refreshTrader')"
              @click="loadTrader"
            >
              <RefreshCw :size="15" />
            </button>
          </div>

          <div v-if="activeTab === 'positions'" class="min-h-0 overflow-auto">
            <table class="w-full border-collapse">
              <thead class="bg-surface sticky top-0 z-10">
                <tr>
                  <th
                    class="border-border text-muted min-w-72 border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
                  >
                    {{ t('common.market') }}
                  </th>
                  <th
                    class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
                  >
                    {{ t('publicTrader.outcome') }}
                  </th>
                  <th
                    class="border-border text-muted border-b px-4 py-2.5 text-right text-xs font-semibold uppercase"
                  >
                    {{ t('position.size') }}
                  </th>
                  <th
                    class="border-border text-muted border-b px-4 py-2.5 text-right text-xs font-semibold uppercase"
                  >
                    {{ t('position.averagePrice') }}
                  </th>
                  <th
                    class="border-border text-muted border-b px-4 py-2.5 text-right text-xs font-semibold uppercase"
                  >
                    {{ t('position.currentPrice') }}
                  </th>
                  <th
                    class="border-border text-muted border-b px-4 py-2.5 text-right text-xs font-semibold uppercase"
                  >
                    {{ t('publicTrader.currentValue') }}
                  </th>
                  <th
                    class="border-border text-muted border-b px-4 py-2.5 text-right text-xs font-semibold uppercase"
                  >
                    {{ t('position.pnl') }}
                  </th>
                  <th
                    class="border-border text-muted border-b px-4 py-2.5 text-right text-xs font-semibold uppercase"
                  >
                    {{ t('position.pnlPercent') }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!positions.length">
                  <td colspan="8" class="text-muted px-4 py-12 text-center text-sm">
                    {{ t('publicTrader.noPositions') }}
                  </td>
                </tr>
                <tr
                  v-for="(position, index) in positions"
                  :key="rowKey(position, index)"
                  class="border-border/60 group cursor-pointer border-b hover:bg-[#1a1a2e]"
                  :title="t('publicTrader.openMarket')"
                  @click="openMarket(position)"
                >
                  <td class="px-4 py-3">
                    <div class="flex min-w-0 items-center gap-2.5">
                      <img
                        v-if="position.icon"
                        :src="position.icon"
                        alt=""
                        class="h-8 w-8 shrink-0 rounded object-cover"
                        @error="hideBrokenImage"
                      />
                      <span class="text-text group-hover:text-primary-light line-clamp-2 text-sm">{{
                        position.title
                      }}</span>
                    </div>
                  </td>
                  <td class="text-text px-4 py-3 text-sm">{{ position.outcome }}</td>
                  <td class="text-text px-4 py-3 text-right text-sm tabular-nums">
                    {{ formatNumber(position.size, 2) }}
                  </td>
                  <td class="text-text px-4 py-3 text-right text-sm tabular-nums">
                    {{ formatPrice(position.avgPrice) }}
                  </td>
                  <td class="text-text px-4 py-3 text-right text-sm tabular-nums">
                    {{ formatPrice(position.currentPrice) }}
                  </td>
                  <td class="text-text px-4 py-3 text-right text-sm tabular-nums">
                    {{ formatUsd(position.currentValue) }}
                  </td>
                  <td
                    class="px-4 py-3 text-right text-sm tabular-nums"
                    :class="position.cashPnl >= 0 ? 'text-green-400' : 'text-red-400'"
                  >
                    {{ formatPnl(position.cashPnl) }}
                  </td>
                  <td
                    class="px-4 py-3 text-right text-sm tabular-nums"
                    :class="position.percentPnl >= 0 ? 'text-green-400' : 'text-red-400'"
                  >
                    {{ formatPercent(position.percentPnl) }}
                  </td>
                </tr>
              </tbody>
            </table>
            <div v-if="hasMorePositions" class="border-border flex justify-center border-t p-3">
              <button
                type="button"
                class="bg-btn-secondary hover:bg-btn-secondary/80 text-text rounded px-3 py-1.5 text-sm transition-colors"
                :disabled="loadingMorePositions"
                :title="t('publicTrader.loadMorePositions')"
                @click="loadMorePositions"
              >
                <LoadingSpinner v-if="loadingMorePositions" :size="15" />
                <span v-else>{{ t('publicTrader.loadMore') }}</span>
              </button>
            </div>
          </div>

          <div v-else class="min-h-0 overflow-auto">
            <table class="w-full border-collapse">
              <thead class="bg-surface sticky top-0 z-10">
                <tr>
                  <th
                    class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
                  >
                    {{ t('publicTrader.tradedAt') }}
                  </th>
                  <th
                    class="border-border text-muted min-w-[76px] border-b px-4 py-2.5 text-left text-xs font-semibold whitespace-nowrap uppercase"
                  >
                    {{ t('trade.direction') }}
                  </th>
                  <th
                    class="border-border text-muted min-w-72 border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
                  >
                    {{ t('common.market') }}
                  </th>
                  <th
                    class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
                  >
                    {{ t('publicTrader.outcome') }}
                  </th>
                  <th
                    class="border-border text-muted border-b px-4 py-2.5 text-right text-xs font-semibold uppercase"
                  >
                    {{ t('common.price') }}
                  </th>
                  <th
                    class="border-border text-muted border-b px-4 py-2.5 text-right text-xs font-semibold uppercase"
                  >
                    {{ t('position.size') }}
                  </th>
                  <th
                    class="border-border text-muted border-b px-4 py-2.5 text-right text-xs font-semibold uppercase"
                  >
                    {{ t('common.amount') }}
                  </th>
                  <th
                    class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
                  >
                    {{ t('publicTrader.transaction') }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!trades.length">
                  <td colspan="8" class="text-muted px-4 py-12 text-center text-sm">
                    {{ t('publicTrader.noTrades') }}
                  </td>
                </tr>
                <tr
                  v-for="(trade, index) in trades"
                  :key="rowKey(trade, index)"
                  class="border-border/60 group cursor-pointer border-b hover:bg-[#1a1a2e]"
                  :title="t('publicTrader.openMarket')"
                  @click="openMarket(trade)"
                >
                  <td class="text-muted px-4 py-3 text-sm whitespace-nowrap">
                    {{ formatTimestamp(trade.timestamp) }}
                  </td>
                  <td
                    class="min-w-[76px] px-4 py-3 text-sm whitespace-nowrap"
                    :class="trade.side === 'BUY' ? 'text-green-400' : 'text-red-400'"
                  >
                    {{ trade.side === 'BUY' ? t('trade.buy') : t('trade.sell') }}
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex min-w-0 items-center gap-2.5">
                      <img
                        v-if="trade.icon"
                        :src="trade.icon"
                        alt=""
                        class="h-8 w-8 shrink-0 rounded object-cover"
                        @error="hideBrokenImage"
                      />
                      <span class="text-text group-hover:text-primary-light line-clamp-2 text-sm">{{
                        trade.title
                      }}</span>
                    </div>
                  </td>
                  <td class="text-text px-4 py-3 text-sm">{{ trade.outcome }}</td>
                  <td class="text-text px-4 py-3 text-right text-sm tabular-nums">
                    {{ formatPrice(trade.price) }}
                  </td>
                  <td class="text-text px-4 py-3 text-right text-sm tabular-nums">
                    {{ formatNumber(trade.size, 2) }}
                  </td>
                  <td class="text-text px-4 py-3 text-right text-sm tabular-nums">
                    {{ formatUsd(trade.size * trade.price) }}
                  </td>
                  <td
                    class="text-muted max-w-40 truncate px-4 py-3 font-mono text-xs"
                    :title="trade.transactionHash ?? undefined"
                  >
                    {{ trade.transactionHash ? formatAddress(trade.transactionHash) : '—' }}
                  </td>
                </tr>
              </tbody>
            </table>
            <div v-if="hasMoreTrades" class="border-border flex justify-center border-t p-3">
              <button
                type="button"
                class="bg-btn-secondary hover:bg-btn-secondary/80 text-text rounded px-3 py-1.5 text-sm transition-colors"
                :disabled="loadingMoreTrades"
                :title="t('publicTrader.loadMoreTrades')"
                @click="loadMoreTrades"
              >
                <LoadingSpinner v-if="loadingMoreTrades" :size="15" />
                <span v-else>{{ t('publicTrader.loadMore') }}</span>
              </button>
            </div>
          </div>
        </section>

        <p v-if="error" class="text-sm text-red-400">{{ error }}</p>
      </div>
    </main>
  </div>
</template>
