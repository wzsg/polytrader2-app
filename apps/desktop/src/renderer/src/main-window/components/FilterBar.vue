<script setup lang="ts">
import type { Filters } from '@polytrader/shared';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  filters: Filters;
}>();

const { t } = useI18n();

const inputClass =
  'h-8 min-w-[88px] rounded-md border border-border bg-bg px-2.5 text-sm text-text outline-none focus:border-primary';

const selectClass =
  'h-8 min-w-[120px] rounded-md border border-border bg-bg px-2.5 text-sm text-text outline-none focus:border-primary';
</script>

<template>
  <div
    class="border-border bg-surface flex shrink-0 flex-wrap items-center gap-4 border-b px-6 py-4"
  >
    <div class="flex shrink-0 items-center gap-1.5">
      <label class="text-muted text-[13px] whitespace-nowrap">
        {{ t('filter.volume24hGreaterThan') }}
      </label>
      <input
        v-model="props.filters.volume24hrMin"
        type="number"
        :placeholder="t('common.min')"
        :class="inputClass"
      />
      <label class="text-muted text-[13px] whitespace-nowrap">
        {{ t('filter.volume24hLessThan') }}
      </label>
      <input
        v-model="props.filters.volume24hrMax"
        type="number"
        :placeholder="t('common.max')"
        :class="inputClass"
      />
    </div>

    <div class="flex shrink-0 items-center gap-1.5">
      <label class="text-muted text-[13px] whitespace-nowrap">
        {{ t('filter.totalVolumeGreaterThan') }}
      </label>
      <input
        v-model="props.filters.volumeMin"
        type="number"
        :placeholder="t('common.min')"
        :class="inputClass"
      />
      <label class="text-muted text-[13px] whitespace-nowrap">
        {{ t('filter.totalVolumeLessThan') }}
      </label>
      <input
        v-model="props.filters.volumeMax"
        type="number"
        :placeholder="t('common.max')"
        :class="inputClass"
      />
    </div>

    <div class="flex shrink-0 items-center gap-1.5">
      <label class="text-muted text-[13px] whitespace-nowrap">
        {{ t('filter.liquidityGreaterThan') }}
      </label>
      <input
        v-model="props.filters.liquidityMin"
        type="number"
        :placeholder="t('common.min')"
        :class="inputClass"
      />
      <label class="text-muted text-[13px] whitespace-nowrap">
        {{ t('filter.liquidityLessThan') }}
      </label>
      <input
        v-model="props.filters.liquidityMax"
        type="number"
        :placeholder="t('common.max')"
        :class="inputClass"
      />
    </div>

    <div class="flex shrink-0 items-center gap-1.5">
      <label class="text-muted text-[13px] whitespace-nowrap">
        {{ t('filter.marketCountGreaterThan') }}
      </label>
      <input
        v-model="props.filters.marketCountMin"
        type="number"
        :placeholder="t('common.min')"
        min="0"
        :class="inputClass"
      />
      <label class="text-muted text-[13px] whitespace-nowrap">
        {{ t('filter.marketCountLessThan') }}
      </label>
      <input
        v-model="props.filters.marketCountMax"
        type="number"
        :placeholder="t('common.max')"
        min="0"
        :class="inputClass"
      />
    </div>

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
