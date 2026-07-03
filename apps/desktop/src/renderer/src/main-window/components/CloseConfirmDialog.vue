<script setup lang="ts">
import { AlertTriangle, X } from '@lucide/vue';
import { useI18n } from 'vue-i18n';

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  confirm: [];
}>();

const { t } = useI18n();
</script>

<template>
  <Transition name="close-dialog">
    <div
      v-if="open"
      class="app-no-drag fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4"
      @click.self="emit('cancel')"
    >
      <section
        class="border-border bg-surface w-full max-w-[420px] rounded-lg border shadow-2xl shadow-black/40"
        role="dialog"
        aria-modal="true"
        aria-labelledby="close-dialog-title"
      >
        <header class="border-border flex items-center gap-3 border-b px-5 py-4">
          <span
            class="text-danger flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#43212a]"
          >
            <AlertTriangle :size="19" :stroke-width="2.2" />
          </span>
          <div class="min-w-0 flex-1">
            <h2 id="close-dialog-title" class="text-[15px] font-semibold text-white">
              {{ t('app.closeMainWindowTitle') }}
            </h2>
            <p class="text-muted-light mt-1 text-[12px]">{{ t('app.closeMainWindowSubtitle') }}</p>
          </div>
          <button
            type="button"
            class="text-muted-light hover:bg-btn-secondary inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:text-white"
            :title="t('common.cancel')"
            @click="emit('cancel')"
          >
            <X :size="16" />
          </button>
        </header>

        <div class="px-5 py-4">
          <p class="text-text text-[13px] leading-6">
            {{ t('app.closeMainWindowMessage') }}
          </p>
        </div>

        <footer class="flex justify-end gap-2 px-5 pb-5">
          <button
            type="button"
            class="bg-btn-secondary hover:bg-btn-secondary-hover inline-flex h-9 items-center rounded-md px-4 text-[13px] font-medium text-white transition-colors"
            @click="emit('cancel')"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            class="bg-danger inline-flex h-9 items-center rounded-md px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#c92f3a]"
            @click="emit('confirm')"
          >
            {{ t('common.close') }}
          </button>
        </footer>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.close-dialog-enter-active,
.close-dialog-leave-active {
  transition: opacity 130ms ease;
}

.close-dialog-enter-active section,
.close-dialog-leave-active section {
  transition:
    opacity 130ms ease,
    transform 130ms ease;
}

.close-dialog-enter-from,
.close-dialog-leave-to {
  opacity: 0;
}

.close-dialog-enter-from section,
.close-dialog-leave-to section {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}
</style>
