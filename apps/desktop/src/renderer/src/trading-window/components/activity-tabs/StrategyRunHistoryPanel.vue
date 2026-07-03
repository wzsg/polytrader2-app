<script setup lang="ts">
import type { StrategyRunListItem } from '@polytrader/shared';
import { formatTimestamp } from '@/shared/utils/format';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';
import { useI18n } from 'vue-i18n';

defineProps<{
  history: StrategyRunListItem[];
  selectedRunId?: string;
  loading?: boolean;
  error?: string;
  embedded?: boolean;
}>();

const emit = defineEmits<{
  selectRun: [runId: string];
}>();

const { t } = useI18n();

function statusClass(status: string): string {
  if (status === 'running') return 'text-emerald-400';
  if (status === 'error' || status === 'stopped_with_cancel_error') return 'text-red-400';
  if (status === 'starting' || status === 'stopping') return 'text-amber-400';
  return 'text-muted-light';
}
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
      <h2 class="text-sm font-semibold text-white">{{ t('tradingWindow.strategyHistoryTab') }}</h2>
      <LoadingSpinner v-if="loading" :title="t('tradingWindow.strategyHistoryTab')" />
      <span v-else class="text-muted text-xs">{{
        t('count.items', { count: history.length })
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
              {{ t('common.strategy') }}
            </th>
            <th class="text-muted px-3 py-2 text-left text-xs font-medium">
              {{ t('common.account') }}
            </th>
            <th class="text-muted px-3 py-2 text-left text-xs font-medium">
              {{ t('common.status') }}
            </th>
            <th class="text-muted px-3 py-2 text-right text-xs font-medium">
              {{ t('common.startedAt') }}
            </th>
            <th class="text-muted px-3 py-2 text-right text-xs font-medium">
              {{ t('common.endedAt') }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="5" class="px-3 py-6 text-center">
              <LoadingSpinner :title="t('tradingWindow.strategyHistoryTab')" />
            </td>
          </tr>
          <tr
            v-for="run in history"
            :key="run.id"
            class="border-border/50 hover:bg-btn-secondary cursor-pointer border-b transition-colors"
            :class="selectedRunId === run.id ? 'bg-primary/10' : ''"
            @click="emit('selectRun', run.id)"
          >
            <td class="text-text max-w-[280px] truncate px-3 py-2">
              {{ run.strategyName }} v{{ run.strategyVersion }}
            </td>
            <td class="text-muted px-3 py-2">{{ run.walletName }}</td>
            <td class="px-3 py-2" :class="statusClass(run.status)">{{ run.status }}</td>
            <td class="text-muted px-3 py-2 text-right text-xs whitespace-nowrap tabular-nums">
              {{ formatTimestamp(run.startedAt) }}
            </td>
            <td class="text-muted px-3 py-2 text-right text-xs whitespace-nowrap tabular-nums">
              {{ formatTimestamp(run.stoppedAt) }}
            </td>
          </tr>
          <tr v-if="history.length === 0 && !loading">
            <td colspan="5" class="text-muted px-3 py-6 text-center text-xs">
              {{ t('strategy.emptyRuns') }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
