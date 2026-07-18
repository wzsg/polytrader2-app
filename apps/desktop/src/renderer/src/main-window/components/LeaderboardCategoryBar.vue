<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { PublicTraderLeaderboardCategory } from '@polytrader/shared';
import { handleHorizontalWheel } from '../../shared/utils/horizontalScroll';

const props = defineProps<{
  category: PublicTraderLeaderboardCategory;
}>();

const emit = defineEmits<{
  'update:category': [value: PublicTraderLeaderboardCategory];
}>();

const { t } = useI18n();

const categories: Array<{ value: PublicTraderLeaderboardCategory; label: string }> = [
  { value: 'OVERALL', label: 'leaderboard.categoryOverall' },
  { value: 'POLITICS', label: 'leaderboard.categoryPolitics' },
  { value: 'SPORTS', label: 'leaderboard.categorySports' },
  { value: 'CRYPTO', label: 'leaderboard.categoryCrypto' },
  { value: 'CULTURE', label: 'leaderboard.categoryCulture' },
  { value: 'MENTIONS', label: 'leaderboard.categoryMentions' },
  { value: 'WEATHER', label: 'leaderboard.categoryWeather' },
  { value: 'ECONOMICS', label: 'leaderboard.categoryEconomics' },
  { value: 'TECH', label: 'leaderboard.categoryTech' },
  { value: 'FINANCE', label: 'leaderboard.categoryFinance' },
];

function buttonClass(selected: boolean): string {
  return selected
    ? 'border-primary/60 bg-primary/20 text-primary-light'
    : 'border-border bg-btn-secondary text-muted-light hover:bg-btn-secondary-hover hover:text-text';
}
</script>

<template>
  <div class="flex min-w-0 flex-1 items-center gap-2" :aria-label="t('leaderboard.category')">
    <div
      class="scrollbar-hidden flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pr-2 whitespace-nowrap"
      @wheel="handleHorizontalWheel"
    >
      <button
        v-for="option in categories"
        :key="option.value"
        type="button"
        class="inline-flex h-8 shrink-0 items-center rounded-md border px-3 text-sm transition-colors"
        :class="buttonClass(props.category === option.value)"
        :title="t(option.label)"
        :aria-label="t(option.label)"
        :aria-pressed="props.category === option.value"
        @click="emit('update:category', option.value)"
      >
        {{ t(option.label) }}
      </button>
    </div>
  </div>
</template>
