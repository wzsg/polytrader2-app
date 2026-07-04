<script setup lang="ts">
import type { Filters } from '@polytrader/shared';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  filters: Pick<Filters, 'status' | 'endDateMin' | 'endDateMax'>;
}>();

const { t } = useI18n();

const inputClass =
  'h-8 min-w-[132px] rounded-md border border-border bg-bg px-2.5 text-sm text-text outline-none focus:border-primary';

const selectClass =
  'h-8 min-w-[120px] rounded-md border border-border bg-bg px-2.5 text-sm text-text outline-none focus:border-primary';
</script>

<template>
  <div
    class="border-border bg-surface flex shrink-0 flex-wrap items-center gap-4 border-b px-6 py-4"
  >
    <div class="flex shrink-0 items-center gap-1.5">
      <label class="text-muted text-[13px] whitespace-nowrap">
        {{ t('filter.endTimeGreaterThan') }}
      </label>
      <input v-model="props.filters.endDateMin" type="date" :class="inputClass" />
      <label class="text-muted text-[13px] whitespace-nowrap">
        {{ t('filter.endTimeLessThan') }}
      </label>
      <input v-model="props.filters.endDateMax" type="date" :class="inputClass" />
    </div>

    <div class="flex shrink-0 items-center gap-1.5">
      <label class="text-muted text-[13px] whitespace-nowrap">{{ t('common.status') }}</label>
      <select v-model="props.filters.status" :class="selectClass">
        <option value="all">{{ t('common.all') }}</option>
        <option value="active">{{ t('status.active') }}</option>
        <option value="closed">{{ t('status.closed') }}</option>
      </select>
    </div>

    <div v-if="$slots.actions" class="ml-auto flex shrink-0 items-center">
      <slot name="actions" />
    </div>
  </div>
</template>
