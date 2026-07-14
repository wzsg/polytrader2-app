<script setup lang="ts">
import { ArrowRight, Download, X } from '@lucide/vue';
import { useI18n } from 'vue-i18n';

defineProps<{
  open: boolean;
  currentVersion: string;
  newVersion: string;
}>();

const emit = defineEmits<{
  cancel: [];
  confirm: [];
}>();

const { t } = useI18n();
</script>

<template>
  <Transition name="update-dialog">
    <div
      v-if="open"
      class="app-no-drag fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4"
      @click.self="emit('cancel')"
    >
      <section
        class="border-border bg-surface w-full max-w-[460px] rounded-lg border shadow-2xl shadow-black/40"
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-dialog-title"
      >
        <header class="border-border flex items-center gap-3 border-b px-5 py-4">
          <span
            class="text-primary-light bg-primary/20 flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
          >
            <Download :size="19" :stroke-width="2.2" />
          </span>
          <div class="min-w-0 flex-1">
            <h2 id="update-dialog-title" class="text-[15px] font-semibold text-white">
              {{ t('update.confirmTitle') }}
            </h2>
            <p class="text-muted-light mt-1 text-[12px]">{{ t('update.confirmSubtitle') }}</p>
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

        <div class="space-y-4 px-5 py-4">
          <p class="text-text text-[13px] leading-6">
            {{ t('update.confirmMessage') }}
          </p>

          <div class="border-border bg-bg flex items-center rounded-md border px-4 py-3">
            <div class="min-w-0 flex-1">
              <div class="text-muted-light text-[11px] font-medium tracking-wide uppercase">
                {{ t('update.currentVersion') }}
              </div>
              <div class="mt-1 text-[14px] font-semibold text-white">{{ currentVersion }}</div>
            </div>
            <ArrowRight class="text-muted mx-4 shrink-0" :size="18" />
            <div class="min-w-0 flex-1 text-right">
              <div class="text-primary-light text-[11px] font-medium tracking-wide uppercase">
                {{ t('update.newVersion') }}
              </div>
              <div class="text-primary-light mt-1 text-[14px] font-semibold">{{ newVersion }}</div>
            </div>
          </div>

          <p class="text-muted-light text-[12px] leading-5">
            {{ t('update.installNotice') }}
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
            class="bg-primary hover:bg-primary/85 inline-flex h-9 items-center gap-2 rounded-md px-4 text-[13px] font-medium text-white transition-colors"
            @click="emit('confirm')"
          >
            <Download :size="15" :stroke-width="2.2" />
            {{ t('update.confirmInstall') }}
          </button>
        </footer>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.update-dialog-enter-active,
.update-dialog-leave-active {
  transition: opacity 130ms ease;
}

.update-dialog-enter-active section,
.update-dialog-leave-active section {
  transition:
    opacity 130ms ease,
    transform 130ms ease;
}

.update-dialog-enter-from,
.update-dialog-leave-to {
  opacity: 0;
}

.update-dialog-enter-from section,
.update-dialog-leave-to section {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}
</style>
