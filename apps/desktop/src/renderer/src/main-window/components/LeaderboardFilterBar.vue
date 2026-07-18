<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { PublicTraderLeaderboardTimePeriod } from '@polytrader/shared';
import { handleHorizontalWheel } from '../../shared/utils/horizontalScroll';

const props = defineProps<{
  timePeriod: PublicTraderLeaderboardTimePeriod;
}>();

const emit = defineEmits<{
  'update:time-period': [value: PublicTraderLeaderboardTimePeriod];
}>();

const { t } = useI18n();

const timePeriods: Array<{ value: PublicTraderLeaderboardTimePeriod; label: string }> = [
  { value: 'DAY', label: 'leaderboard.day' },
  { value: 'WEEK', label: 'leaderboard.week' },
  { value: 'MONTH', label: 'leaderboard.month' },
  { value: 'ALL', label: 'leaderboard.allTime' },
];

function buttonClass(selected: boolean): string {
  return selected
    ? 'border-primary/60 bg-primary/20 text-primary-light'
    : 'border-border bg-btn-secondary text-muted-light hover:bg-btn-secondary-hover hover:text-text';
}
</script>

<template>
  <div class="border-border bg-surface flex shrink-0 items-center gap-2 border-b px-6 py-3.5">
    <div
      class="scrollbar-hidden flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pr-2 whitespace-nowrap"
      :aria-label="t('leaderboard.timePeriod')"
      @wheel="handleHorizontalWheel"
    >
      <button
        v-for="option in timePeriods"
        :key="option.value"
        type="button"
        class="inline-flex h-8 shrink-0 items-center rounded-md border px-3 text-sm font-medium transition-colors"
        :class="buttonClass(props.timePeriod === option.value)"
        :aria-pressed="props.timePeriod === option.value"
        @click="emit('update:time-period', option.value)"
      >
        {{ t(option.label) }}
      </button>
    </div>
  </div>
</template>
