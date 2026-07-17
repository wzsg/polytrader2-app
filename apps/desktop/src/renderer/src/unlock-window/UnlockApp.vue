<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { AppLocale, SetupState } from '@polytrader/shared';
import { LockKeyhole } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import TitleBar from '../shared/components/TitleBar.vue';

const { t, locale } = useI18n();
const password = ref('');
const errorMessage = ref('');
const isSubmitting = ref(false);
const appVersion = `v${__APP_VERSION__}`;
const canUnlock = computed(() => password.value.length > 0 && !isSubmitting.value);

function resolveLocale(state: SetupState): AppLocale {
  if (state.localePreference === 'en-US' || state.localePreference === 'zh-CN') {
    return state.localePreference;
  }
  return state.systemLocale.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
}

async function unlock(): Promise<void> {
  if (!canUnlock.value) return;
  isSubmitting.value = true;
  errorMessage.value = '';
  try {
    const result = await window.api.unlockInitialSetup(password.value);
    if (!result.ok) errorMessage.value = result.error;
  } finally {
    isSubmitting.value = false;
  }
}

async function close(): Promise<void> {
  await window.api.cancelInitialSetup();
}

onMounted(async () => {
  const state = await window.api.getSetupState();
  locale.value = resolveLocale(state);
});
</script>

<template>
  <div class="flex h-full flex-col">
    <TitleBar
      :title="t('setup.unlockTitle')"
      :subtitle="appVersion"
      show-brand-icon
      custom-close
      window-controls="close-only"
      @close="close"
    />
    <main class="bg-bg flex min-h-0 flex-1 items-center justify-center p-6">
      <form class="border-border bg-surface w-full rounded-lg border p-6" @submit.prevent="unlock">
        <div class="flex items-center gap-3">
          <span
            class="bg-primary/15 text-primary flex size-10 items-center justify-center rounded-lg"
          >
            <LockKeyhole :size="20" aria-hidden="true" />
          </span>
          <div>
            <h1 class="text-base font-semibold text-white">{{ t('setup.unlockTitle') }}</h1>
            <p class="text-muted mt-1 text-xs">{{ t('setup.unlockHint') }}</p>
          </div>
        </div>
        <label class="text-muted-light mt-6 block text-xs" for="unlock-password">
          {{ t('setup.password') }}
        </label>
        <input
          id="unlock-password"
          v-model="password"
          type="password"
          autofocus
          class="border-border bg-bg text-text mt-2 w-full rounded border px-3 py-2"
          :placeholder="t('setup.password')"
          :aria-label="t('setup.password')"
          :disabled="isSubmitting"
        />
        <p v-if="errorMessage" class="text-danger mt-3 text-sm" role="alert">
          {{ errorMessage }}
        </p>
        <div class="mt-6 flex justify-end gap-3">
          <button
            type="button"
            class="text-muted-light hover:text-text px-3 py-2 text-sm transition-colors"
            :disabled="isSubmitting"
            @click="close"
          >
            {{ t('common.close') }}
          </button>
          <button
            type="submit"
            class="bg-primary hover:bg-primary-hover rounded px-4 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="!canUnlock"
          >
            {{ t('setup.unlock') }}
          </button>
        </div>
      </form>
    </main>
  </div>
</template>
