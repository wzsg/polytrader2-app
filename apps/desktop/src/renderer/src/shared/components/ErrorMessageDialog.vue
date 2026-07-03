<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { AlertTriangle, Check, Copy, X } from '@lucide/vue';

withDefaults(
  defineProps<{
    title?: string;
    message: string;
  }>(),
  {
    title: 'Error Details',
  },
);

const emit = defineEmits<{
  close: [];
}>();

const copied = ref(false);
const { t } = useI18n();

async function copyMessage(message: string): Promise<void> {
  if (!message) return;
  await navigator.clipboard.writeText(message);
  copied.value = true;
  window.setTimeout(() => {
    copied.value = false;
  }, 1200);
}
</script>

<template>
  <Teleport to="body">
    <div
      class="app-no-drag fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="error-message-dialog-title"
      tabindex="-1"
      @click.self="emit('close')"
      @keydown.esc="emit('close')"
    >
      <section
        class="border-border bg-surface flex w-full max-w-lg flex-col overflow-hidden rounded-lg border shadow-2xl shadow-black/40"
      >
        <header class="border-border flex items-center justify-between gap-3 border-b px-5 py-4">
          <div class="flex min-w-0 items-center gap-3">
            <span
              class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-red-500/15 text-red-300"
            >
              <AlertTriangle :size="19" :stroke-width="2.2" />
            </span>
            <h2 id="error-message-dialog-title" class="truncate text-sm font-semibold text-white">
              {{ title }}
            </h2>
          </div>
          <button
            type="button"
            class="text-muted-light hover:bg-btn-secondary hover:text-text inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors"
            :aria-label="t('common.close')"
            @click="emit('close')"
          >
            <X :size="16" />
          </button>
        </header>

        <div class="px-5 py-4">
          <pre
            class="selectable-text border-border bg-bg text-text max-h-[260px] overflow-auto rounded-md border p-3 text-xs leading-relaxed whitespace-pre-wrap"
            >{{ message }}</pre
          >
        </div>

        <footer class="border-border flex justify-end gap-2 border-t px-5 py-4">
          <button
            type="button"
            class="border-border bg-btn-secondary text-text hover:bg-btn-secondary-hover inline-flex h-9 items-center gap-2 rounded-md border px-4 text-sm transition-colors"
            @click="copyMessage(message)"
          >
            <Check v-if="copied" :size="15" />
            <Copy v-else :size="15" />
            {{ copied ? t('common.copied') : t('common.copy') }}
          </button>
          <button
            type="button"
            class="border-border bg-btn-secondary text-text hover:bg-btn-secondary-hover inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm transition-colors"
            @click="emit('close')"
          >
            {{ t('common.close') }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
