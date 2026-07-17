<script setup lang="ts">
import type { AppUpdateStatus } from '@polytrader/shared';
import { Download } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  open: boolean;
  newVersion: string;
  status: AppUpdateStatus;
}>();

const { t } = useI18n();

const message = computed(() =>
  props.status === 'error' ? t('update.mandatoryError') : t('update.mandatoryMessage'),
);
</script>

<template>
  <Transition name="mandatory-update-dialog">
    <div
      v-if="open"
      class="app-no-drag fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4"
    >
      <section
        class="border-border bg-surface w-full max-w-[460px] rounded-lg border shadow-2xl shadow-black/40"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="mandatory-update-dialog-title"
      >
        <div class="space-y-4 px-5 py-5 text-center">
          <span
            class="text-primary-light bg-primary/20 mx-auto flex h-10 w-10 items-center justify-center rounded-md"
          >
            <Download :size="20" :stroke-width="2.2" />
          </span>
          <div>
            <h2 id="mandatory-update-dialog-title" class="text-[15px] font-semibold text-white">
              {{ t('update.mandatoryTitle') }}
            </h2>
            <p class="text-muted-light mt-2 text-[13px] leading-6">{{ message }}</p>
          </div>
          <p class="text-primary-light text-[14px] font-semibold">{{ newVersion }}</p>
        </div>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.mandatory-update-dialog-enter-active,
.mandatory-update-dialog-leave-active {
  transition: opacity 130ms ease;
}

.mandatory-update-dialog-enter-from,
.mandatory-update-dialog-leave-to {
  opacity: 0;
}
</style>
