<script setup lang="ts">
import type { ClobTrade } from '@polytrader/shared';
import {
  formatNumber,
  formatPrice,
  formatTimestamp,
  sideClass,
  sideLabel,
} from '@/shared/utils/format';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';
import { useI18n } from 'vue-i18n';

defineProps<{
  trades: ClobTrade[];
  loading?: boolean;
  error?: string;
  embedded?: boolean;
}>();

const { t } = useI18n();
</script>

<template>
  <section
    class="overflow-hidden"
    :class="
      embedded
        ? 'flex min-h-0 flex-1 flex-col'
        : 'border-border bg-detail-bg max-h-[220px] shrink-0 rounded-lg border'
    "
  >
    <div
      v-if="!embedded"
      class="border-border flex items-center justify-between border-b px-4 py-3"
    >
      <h2 class="text-sm font-semibold text-white">{{ t('tradingWindow.tradesTab') }}</h2>
      <LoadingSpinner v-if="loading" :title="t('account.trades')" />
      <span v-else class="text-muted text-xs">{{
        t('count.items', { count: trades.length })
      }}</span>
    </div>

    <div v-if="error" class="px-4 py-3 text-xs text-red-400">
      {{ error }}
    </div>

    <div class="overflow-auto" :class="embedded ? 'min-h-0 flex-1' : 'max-h-[170px]'">
      <table class="w-full border-collapse text-sm">
        <thead class="bg-surface sticky top-0">
          <tr>
            <th class="text-muted px-3 py-2 text-left text-xs font-medium">
              {{ t('trade.direction') }}
            </th>
            <th class="text-muted px-3 py-2 text-right text-xs font-medium">
              {{ t('common.price') }}
            </th>
            <th class="text-muted px-3 py-2 text-right text-xs font-medium">
              {{ t('common.quantity') }}
            </th>
            <th class="text-muted px-3 py-2 text-left text-xs font-medium">Outcome</th>
            <th class="text-muted px-3 py-2 text-left text-xs font-medium">
              {{ t('trade.role') }}
            </th>
            <th class="text-muted px-3 py-2 text-right text-xs font-medium">
              {{ t('trade.tradedAt') }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="6" class="px-3 py-6 text-center">
              <LoadingSpinner :title="t('account.trades')" />
            </td>
          </tr>
          <tr v-for="trade in trades" :key="trade.id" class="border-border/50 border-b">
            <td class="px-3 py-2" :class="sideClass(trade.side)">
              {{ sideLabel(trade.side) }}
            </td>
            <td class="text-text px-3 py-2 text-right tabular-nums">
              {{ formatPrice(trade.price) }}
            </td>
            <td class="text-text px-3 py-2 text-right tabular-nums">
              {{ formatNumber(trade.size, 4) }}
            </td>
            <td class="text-text px-3 py-2">{{ trade.outcome || '—' }}</td>
            <td class="text-muted px-3 py-2">{{ trade.trader_side || '—' }}</td>
            <td class="text-muted px-3 py-2 text-right text-xs whitespace-nowrap tabular-nums">
              {{ formatTimestamp(trade.match_time) }}
            </td>
          </tr>
          <tr v-if="trades.length === 0 && !loading">
            <td colspan="6" class="text-muted px-3 py-6 text-center text-xs">
              {{ t('trade.noTrades') }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
