<script setup lang="ts">
import { ChevronLeft, ChevronRight } from '@lucide/vue';
import { translateUiKey } from '../i18n';

defineProps<{
  pageInfo: string;
  canPrev: boolean;
  canNext: boolean;
}>();

const emit = defineEmits<{
  prev: [];
  next: [];
}>();

const btnClass =
  'inline-flex items-center gap-1 rounded-md bg-btn-secondary px-2.5 py-1.5 text-[13px] text-text transition-colors hover:bg-btn-secondary-hover disabled:cursor-not-allowed disabled:opacity-40';
</script>

<template>
  <div
    class="border-border bg-surface flex shrink-0 items-center justify-center gap-4 border-t px-4 py-4"
  >
    <button type="button" :class="btnClass" :disabled="!canPrev" @click="emit('prev')">
      <ChevronLeft :size="16" />
      {{ translateUiKey('common.previous') }}
    </button>
    <span class="text-muted text-sm">{{ pageInfo }}</span>
    <button type="button" :class="btnClass" :disabled="!canNext" @click="emit('next')">
      {{ translateUiKey('common.next') }}
      <ChevronRight :size="16" />
    </button>
  </div>
</template>
