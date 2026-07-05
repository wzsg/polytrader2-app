<script setup lang="ts">
import type { Filters } from '@polytrader/shared';
import { Search } from '@lucide/vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  filters: Pick<Filters, 'search'>;
}>();

const { t } = useI18n();
</script>

<template>
  <div
    class="border-border bg-bg focus-within:border-primary flex h-8 w-[330px] max-w-[34vw] min-w-[220px] items-center gap-2 rounded-md border px-2.5 text-sm transition-colors"
    :title="t('common.search')"
  >
    <Search :size="14" class="text-muted shrink-0" />
    <input
      v-model="props.filters.search"
      type="search"
      class="placeholder:text-muted text-text min-w-0 flex-1 bg-transparent outline-none"
      :placeholder="t('filter.searchPlaceholder')"
      :aria-label="t('common.search')"
    />
  </div>
</template>
