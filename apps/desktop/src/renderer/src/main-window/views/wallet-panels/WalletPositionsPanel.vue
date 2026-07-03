<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { DataPosition } from '@polytrader/shared';
import {
  formatNumber,
  formatPercent,
  formatPnl,
  formatPrice,
  formatUsd,
} from '@/shared/utils/format';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';

defineProps<{
  walletId: string;
  positions: DataPosition[];
  loading: boolean;
  error: string;
  configured: boolean;
}>();

const emit = defineEmits<{
  error: [message: string];
}>();

const { t } = useI18n();

function eventTitle(position: DataPosition): string {
  return position.event_title || position.title || '—';
}

function marketTitle(position: DataPosition): string {
  return position.market_title || position.conditionId || '—';
}

function marketIcon(position: DataPosition): string {
  return position.event_icon || position.market_icon || position.icon || '';
}

function positionMarketId(position: DataPosition): string {
  return position.market_id || '';
}

function positionEventId(position: DataPosition): string {
  return position.event_id || '';
}

function positionTokenId(position: DataPosition): string | null {
  return position.asset || null;
}

function canOpenPositionMarket(position: DataPosition): boolean {
  return Boolean(positionMarketId(position) && positionEventId(position));
}

function openPositionMarket(position: DataPosition): void {
  const marketId = positionMarketId(position);
  const eventId = positionEventId(position);
  if (!marketId || !eventId) return;

  window.api
    .openTradingWindow({
      marketId,
      eventId,
      tokenId: positionTokenId(position),
      outcome: position.outcome || null,
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      emit('error', message);
    });
}

function hideBrokenImage(event: Event): void {
  const target = event.currentTarget;
  if (target instanceof HTMLImageElement) target.style.display = 'none';
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div v-if="loading" class="flex flex-1 items-center justify-center">
      <LoadingSpinner :size="22" :title="t('position.loadPositions')" />
    </div>
    <div
      v-else-if="error"
      class="flex flex-1 items-center justify-center px-6 text-sm text-red-400"
    >
      {{ error }}
    </div>
    <div
      v-else-if="!walletId || !configured || !positions.length"
      class="text-muted flex flex-1 items-center justify-center text-sm"
    >
      {{
        !walletId
          ? t('trade.selectAccount')
          : !configured
            ? t('position.unavailable')
            : t('position.noPositions')
      }}
    </div>
    <div v-else class="min-h-0 flex-1 overflow-auto">
      <table class="w-full border-collapse">
        <thead class="bg-surface sticky top-0 z-10">
          <tr>
            <th
              class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
            >
              {{ t('common.market') }}
            </th>
            <th
              class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
            >
              Outcome
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
              {{ t('position.pnl') }}
            </th>
            <th
              class="border-border text-muted border-b px-4 py-2.5 text-right text-xs font-semibold uppercase"
            >
              {{ t('position.pnlPercent') }}
            </th>
            <th
              class="border-border text-muted border-b px-4 py-2.5 text-right text-xs font-semibold uppercase"
            >
              {{ t('position.value') }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(pos, index) in positions"
            :key="`${pos.conditionId}-${pos.outcomeIndex}-${index}`"
            class="border-border/60 group border-b hover:bg-[#1a1a2e]"
            :class="canOpenPositionMarket(pos) ? 'cursor-pointer' : 'cursor-default'"
            :title="canOpenPositionMarket(pos) ? t('market.openTradingWindow') : undefined"
            @click="openPositionMarket(pos)"
          >
            <td class="min-w-[280px] px-4 py-3">
              <div class="flex min-w-0 items-center gap-2.5">
                <img
                  v-if="marketIcon(pos)"
                  :src="marketIcon(pos)"
                  alt=""
                  class="h-8 w-8 shrink-0 rounded object-cover"
                  @error="hideBrokenImage"
                />
                <div class="min-w-0">
                  <div
                    class="text-text truncate text-sm"
                    :class="{ 'group-hover:text-primary-light': canOpenPositionMarket(pos) }"
                    :title="eventTitle(pos)"
                  >
                    {{ eventTitle(pos) }}
                  </div>
                  <div
                    class="text-muted truncate text-xs"
                    :class="{ 'group-hover:text-text': canOpenPositionMarket(pos) }"
                    :title="marketTitle(pos)"
                  >
                    {{ marketTitle(pos) }}
                  </div>
                </div>
              </div>
            </td>
            <td class="text-text px-4 py-3 text-sm">{{ pos.outcome || '—' }}</td>
            <td class="text-text px-4 py-3 text-right text-sm">{{ formatNumber(pos.size, 2) }}</td>
            <td class="text-text px-4 py-3 text-right text-sm">{{ formatPrice(pos.avgPrice) }}</td>
            <td class="text-text px-4 py-3 text-right text-sm">{{ formatPrice(pos.curPrice) }}</td>
            <td
              class="px-4 py-3 text-right text-sm"
              :class="Number(pos.cashPnl) >= 0 ? 'text-green-400' : 'text-red-400'"
            >
              {{ formatPnl(pos.cashPnl) }}
            </td>
            <td
              class="px-4 py-3 text-right text-sm"
              :class="Number(pos.percentPnl) >= 0 ? 'text-green-400' : 'text-red-400'"
            >
              {{ formatPercent(pos.percentPnl) }}
            </td>
            <td class="text-text px-4 py-3 text-right text-sm">
              {{ formatUsd(pos.currentValue) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
