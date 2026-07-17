<script setup lang="ts">
import { AlertTriangle, X } from '@lucide/vue';

defineProps<{
  title: string;
  message: string;
}>();

const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <aside
    class="app-no-drag border-watchlist/60 bg-sidebar fixed top-12 right-4 z-50 flex w-[min(420px,calc(100vw-2rem))] gap-3 rounded-lg border p-4 shadow-xl shadow-black/45"
    role="status"
    aria-live="polite"
  >
    <AlertTriangle :size="20" class="text-watchlist mt-0.5 shrink-0" aria-hidden="true" />
    <div class="min-w-0 flex-1">
      <p class="text-sm font-semibold text-white">{{ title }}</p>
      <p class="text-muted-light mt-1 text-xs leading-5">{{ message }}</p>
    </div>
    <button
      type="button"
      class="text-muted-light hover:text-text -mt-1 -mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors hover:bg-white/10"
      :title="$t('common.close')"
      :aria-label="$t('common.close')"
      @click="emit('close')"
    >
      <X :size="16" />
    </button>
  </aside>
</template>
