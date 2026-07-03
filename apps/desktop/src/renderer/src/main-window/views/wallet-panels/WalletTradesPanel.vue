<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { ClobTrade } from '@polytrader/shared';
import {
  formatNumber,
  formatPrice,
  formatTimestamp,
  sideClass,
  sideLabel,
} from '@/shared/utils/format';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';

defineProps<{
  walletId: string;
  trades: ClobTrade[];
  loading: boolean;
  error: string;
  configured: boolean;
}>();

const emit = defineEmits<{
  error: [message: string];
}>();

const { t } = useI18n();

function eventTitle(trade: ClobTrade): string {
  return trade.event_title || '—';
}

function marketTitle(trade: ClobTrade): string {
  return trade.market_title || trade.condition_id || trade.market || '—';
}

function marketIcon(trade: ClobTrade): string {
  return trade.event_icon || trade.market_icon || '';
}

function tradeMarketId(trade: ClobTrade): string {
  return trade.market_id || '';
}

function tradeEventId(trade: ClobTrade): string {
  return trade.event_id || '';
}

function tradeTokenId(trade: ClobTrade): string | null {
  return trade.asset_id || null;
}

function canOpenTradeMarket(trade: ClobTrade): boolean {
  return Boolean(tradeMarketId(trade) && tradeEventId(trade));
}

function openTradeMarket(trade: ClobTrade): void {
  const marketId = tradeMarketId(trade);
  const eventId = tradeEventId(trade);
  if (!marketId || !eventId) return;

  window.api
    .openTradingWindow({
      marketId,
      eventId,
      tokenId: tradeTokenId(trade),
      outcome: trade.outcome || null,
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
      <LoadingSpinner :size="22" :title="t('account.trades')" />
    </div>
    <div
      v-else-if="error"
      class="flex flex-1 items-center justify-center px-6 text-sm text-red-400"
    >
      {{ error }}
    </div>
    <div
      v-else-if="!walletId || !configured || !trades.length"
      class="text-muted flex flex-1 items-center justify-center text-sm"
    >
      {{
        !walletId
          ? t('trade.selectAccount')
          : !configured
            ? t('trade.configureTradableAccount')
            : t('trade.noTrades')
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
              {{ t('trade.direction') }}
            </th>
            <th
              class="border-border text-muted border-b px-4 py-2.5 text-right text-xs font-semibold uppercase"
            >
              {{ t('common.price') }}
            </th>
            <th
              class="border-border text-muted border-b px-4 py-2.5 text-right text-xs font-semibold uppercase"
            >
              {{ t('common.quantity') }}
            </th>
            <th
              class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
            >
              Outcome
            </th>
            <th
              class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
            >
              {{ t('trade.role') }}
            </th>
            <th
              class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
            >
              {{ t('trade.tradedAt') }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="trade in trades"
            :key="trade.id"
            class="border-border/60 group border-b hover:bg-[#1a1a2e]"
            :class="canOpenTradeMarket(trade) ? 'cursor-pointer' : 'cursor-default'"
            :title="canOpenTradeMarket(trade) ? t('market.openTradingWindow') : undefined"
            @click="openTradeMarket(trade)"
          >
            <td class="min-w-[260px] px-4 py-3">
              <div class="flex min-w-0 items-center gap-2.5">
                <img
                  v-if="marketIcon(trade)"
                  :src="marketIcon(trade)"
                  alt=""
                  class="h-8 w-8 shrink-0 rounded object-cover"
                  @error="hideBrokenImage"
                />
                <div class="min-w-0">
                  <div
                    class="text-text truncate text-sm"
                    :class="{ 'group-hover:text-primary-light': canOpenTradeMarket(trade) }"
                    :title="eventTitle(trade)"
                  >
                    {{ eventTitle(trade) }}
                  </div>
                  <div
                    class="text-muted truncate text-xs"
                    :class="{ 'group-hover:text-text': canOpenTradeMarket(trade) }"
                    :title="marketTitle(trade)"
                  >
                    {{ marketTitle(trade) }}
                  </div>
                </div>
              </div>
            </td>
            <td class="px-4 py-3 text-sm" :class="sideClass(trade.side)">
              {{ sideLabel(trade.side) }}
            </td>
            <td class="text-text px-4 py-3 text-right text-sm">{{ formatPrice(trade.price) }}</td>
            <td class="text-text px-4 py-3 text-right text-sm">
              {{ formatNumber(trade.size, 4) }}
            </td>
            <td class="text-text px-4 py-3 text-sm">{{ trade.outcome || '—' }}</td>
            <td class="text-muted px-4 py-3 text-sm">{{ trade.trader_side || '—' }}</td>
            <td class="text-muted px-4 py-3 text-sm">{{ formatTimestamp(trade.match_time) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
