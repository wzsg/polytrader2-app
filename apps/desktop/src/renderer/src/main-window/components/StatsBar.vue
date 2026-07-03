<script setup lang="ts">
import { useI18n } from 'vue-i18n';

defineProps<{
  variant: 'events' | 'watchlist';
  totalCount: number;
  filteredCount: number;
  activeCount: number;
}>();

const { t } = useI18n();
</script>

<template>
  <div
    class="border-border bg-sidebar text-muted flex shrink-0 items-center justify-between gap-6 border-b px-6 py-2.5 text-sm"
  >
    <div class="flex min-w-0 items-center gap-6">
      <span>
        {{ variant === 'watchlist' ? t('stats.watchlistTotal') : t('stats.total') }}:
        <strong class="text-primary">{{ totalCount }}</strong>
      </span>
      <span>
        {{ variant === 'watchlist' ? t('stats.watchlistFiltered') : t('stats.filtered') }}:
        <strong class="text-primary">{{ filteredCount }}</strong>
      </span>
      <span v-if="variant === 'events'">
        {{ t('stats.active') }}: <strong class="text-primary">{{ activeCount }}</strong>
      </span>
    </div>
    <div class="flex shrink-0 items-center justify-end">
      <slot name="actions" />
    </div>
  </div>
</template>
