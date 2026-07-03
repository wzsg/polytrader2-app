<script setup lang="ts">
import type { StrategyRunLogEntry } from '@polytrader/shared';
import { formatTimestamp } from '@/shared/utils/format';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';
import { useI18n } from 'vue-i18n';

defineProps<{
  logs: StrategyRunLogEntry[];
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
      <h2 class="text-sm font-semibold text-white">{{ t('tradingWindow.strategyLogsTab') }}</h2>
      <LoadingSpinner v-if="loading" :title="t('tradingWindow.strategyLogsTab')" />
      <span v-else class="text-muted text-xs">{{ t('count.items', { count: logs.length }) }}</span>
    </div>

    <div v-if="error" class="px-4 py-3 text-xs text-red-400">
      {{ error }}
    </div>

    <div class="overflow-auto" :class="embedded ? 'min-h-0 flex-1' : 'max-h-[170px]'">
      <table class="w-full border-collapse text-sm">
        <thead class="bg-surface sticky top-0">
          <tr>
            <th class="text-muted px-3 py-2 text-left text-xs font-medium">
              {{ t('common.level') }}
            </th>
            <th class="text-muted px-3 py-2 text-left text-xs font-medium">
              {{ t('common.module') }}
            </th>
            <th class="text-muted px-3 py-2 text-left text-xs font-medium">
              {{ t('common.message') }}
            </th>
            <th class="text-muted px-3 py-2 text-right text-xs font-medium">
              {{ t('trade.tradedAt') }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="4" class="px-3 py-6 text-center">
              <LoadingSpinner :title="t('tradingWindow.strategyLogsTab')" />
            </td>
          </tr>
          <tr v-for="log in logs" :key="log.id" class="border-border/50 border-b">
            <td
              class="px-3 py-2"
              :class="
                log.level === 'error'
                  ? 'text-red-400'
                  : log.level === 'warn'
                    ? 'text-amber-400'
                    : 'text-emerald-400'
              "
            >
              {{ log.level }}
            </td>
            <td class="text-muted px-3 py-2">{{ log.module }}</td>
            <td class="text-text max-w-[520px] truncate px-3 py-2" :title="log.message">
              {{ log.message }}
            </td>
            <td class="text-muted px-3 py-2 text-right text-xs whitespace-nowrap tabular-nums">
              {{ formatTimestamp(log.time) }}
            </td>
          </tr>
          <tr v-if="logs.length === 0 && !loading">
            <td colspan="4" class="text-muted px-3 py-6 text-center text-xs">
              {{ t('bot.emptyLogs') }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
