<script setup lang="ts">
import type { CSSProperties } from 'vue';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatNumber } from '@/shared/utils/format';

interface MergePositionItem {
  outcome?: string;
  size?: unknown;
}

const props = defineProps<{
  positions: MergePositionItem[];
  amount: string;
  maxAmount: number;
  error: string;
  confirmDisabled: boolean;
  style: CSSProperties;
}>();

const emit = defineEmits<{
  cancel: [];
  confirm: [];
  'update:amount': [value: string];
}>();

const { t } = useI18n();
const rootEl = ref<HTMLElement | null>(null);

function updateAmount(event: Event): void {
  emit('update:amount', (event.target as HTMLInputElement).value);
}

function contains(target: Node): boolean {
  return rootEl.value?.contains(target) ?? false;
}

defineExpose({ contains });
</script>

<template>
  <div
    ref="rootEl"
    class="border-border bg-detail-bg fixed z-[9999] w-64 -translate-x-1/2 -translate-y-full rounded-md border p-3 shadow-xl"
    :style="props.style"
  >
    <div
      class="border-border bg-detail-bg absolute bottom-[-5px] left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 border-r border-b"
    />
    <div
      class="bg-detail-bg absolute bottom-[-3.5px] left-1/2 h-2 w-2 -translate-x-1/2 rotate-45"
    />

    <div class="space-y-3">
      <div>
        <p class="text-muted mb-1 block text-xs">
          {{ t('position.selectedOutcomes') }}
        </p>
        <div class="border-border bg-surface overflow-hidden rounded-md border text-xs">
          <div
            v-for="(position, index) in props.positions"
            :key="`${position.outcome}-${index}`"
            class="border-border/60 flex h-8 items-center justify-between gap-2 px-2"
            :class="index === props.positions.length - 1 ? '' : 'border-b'"
          >
            <span class="min-w-0 truncate text-white">
              {{ position.outcome || '—' }}
            </span>
            <span class="text-primary-light shrink-0 tabular-nums">
              {{ formatNumber(position.size, 2) }}
            </span>
          </div>
        </div>
      </div>

      <div>
        <label class="text-muted mb-1 block text-xs" for="position-merge-amount">
          {{ t('common.amount') }}
        </label>
        <input
          id="position-merge-amount"
          :value="props.amount"
          type="number"
          min="0"
          :max="props.maxAmount"
          step="0.01"
          class="border-border bg-surface focus:border-primary h-8 w-full rounded-md border px-2 text-xs text-white outline-none"
          :placeholder="t('common.amount')"
          @input="updateAmount"
        />
        <p v-if="props.error" class="mt-1 text-xs text-red-400">
          {{ props.error }}
        </p>
      </div>

      <div class="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          class="hover:bg-btn-secondary text-muted-light h-8 rounded-md px-3 text-xs font-medium transition-colors hover:text-white"
          @click="emit('cancel')"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          type="button"
          class="bg-primary hover:bg-primary-light disabled:bg-surface h-8 rounded-md px-3 text-xs font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:text-white/45"
          :disabled="props.confirmDisabled"
          @click="emit('confirm')"
        >
          {{ t('common.confirm') }}
        </button>
      </div>
    </div>
  </div>
</template>
