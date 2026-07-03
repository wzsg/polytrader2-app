<script setup lang="ts">
import { Play, Square } from '@lucide/vue';
import type { StrategyBotListItem } from '@polytrader/shared';
import { formatTimestamp } from '@/shared/utils/format';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';
import { useI18n } from 'vue-i18n';

defineProps<{
  bots: StrategyBotListItem[];
  loading?: boolean;
  error?: string;
  busyBotId?: string;
}>();

const emit = defineEmits<{
  start: [botId: string];
  stop: [botId: string];
}>();

const { t } = useI18n();

function statusClass(status: string): string {
  if (status === 'running') return 'text-emerald-400';
  if (status === 'starting' || status === 'stopping') return 'text-amber-400';
  if (status === 'error') return 'text-red-400';
  return 'text-muted-light';
}
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div v-if="error" class="px-4 py-3 text-xs text-red-400">
      {{ error }}
    </div>

    <div class="min-h-0 flex-1 overflow-auto">
      <table class="w-full border-collapse text-sm">
        <thead class="bg-surface sticky top-0">
          <tr>
            <th class="text-muted px-3 py-2 text-left text-xs font-medium">
              {{ t('common.name') }}
            </th>
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
              {{ t('bot.recentRun') }}
            </th>
            <th class="text-muted px-3 py-2 text-right text-xs font-medium">
              {{ t('common.action') }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="6" class="px-3 py-6 text-center">
              <LoadingSpinner :title="t('tradingWindow.botsTab')" />
            </td>
          </tr>
          <tr v-for="bot in bots" :key="bot.id" class="border-border/50 border-b">
            <td class="text-text max-w-[260px] truncate px-3 py-2">
              {{ bot.name }}
              <p v-if="bot.runtimeError" class="mt-1 truncate text-xs text-red-400">
                {{ bot.runtimeError }}
              </p>
            </td>
            <td class="text-muted px-3 py-2">{{ bot.strategyName }} v{{ bot.strategyVersion }}</td>
            <td class="text-muted px-3 py-2">{{ bot.walletName }}</td>
            <td class="px-3 py-2" :class="statusClass(bot.status)">{{ bot.status }}</td>
            <td class="text-muted px-3 py-2 text-right text-xs whitespace-nowrap tabular-nums">
              {{ bot.lastRun ? formatTimestamp(bot.lastRun.startedAt) : t('common.notAvailable') }}
            </td>
            <td class="px-3 py-2 text-right">
              <button
                v-if="bot.status !== 'running' && bot.status !== 'starting'"
                type="button"
                class="bg-primary hover:bg-primary-hover inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                :disabled="!!busyBotId || !bot.enabled"
                @click="emit('start', bot.id)"
              >
                <LoadingSpinner v-if="busyBotId === bot.id" :size="13" :title="t('bot.startBot')" />
                <Play v-else :size="13" />
                {{ t('bot.start') }}
              </button>
              <button
                v-else
                type="button"
                class="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 px-2.5 py-1.5 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/10 disabled:opacity-50"
                :disabled="!!busyBotId"
                @click="emit('stop', bot.id)"
              >
                <LoadingSpinner v-if="busyBotId === bot.id" :size="13" :title="t('bot.stopBot')" />
                <Square v-else :size="13" />
                {{ t('bot.stop') }}
              </button>
            </td>
          </tr>
          <tr v-if="bots.length === 0 && !loading">
            <td colspan="6" class="text-muted px-3 py-6 text-center text-xs">
              {{ t('bot.empty') }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
