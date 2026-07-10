<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Check, Database, FolderOpen, HardDrive, LockKeyhole, Languages } from '@lucide/vue';
import type { AppLocalePreference, SetupState, SyncStatus } from '@polytrader/shared';
import { useI18n } from 'vue-i18n';
import TitleBar from '../shared/components/TitleBar.vue';
import LoadingSpinner from '../shared/components/LoadingSpinner.vue';

type SetupPhase = 'language' | 'storage' | 'security' | 'sync' | 'complete' | 'error';
type EncryptionMethod = 'keychain' | 'dpapi' | 'aes-256-gcm';

const { t, locale } = useI18n();
const state = ref<SetupState | null>(null);
const dataDirectory = ref('');
const languagePreference = ref<AppLocalePreference>('system');
const encryptionMethod = ref<EncryptionMethod>('aes-256-gcm');
const password = ref('');
const confirmPassword = ref('');
const phase = ref<SetupPhase>('language');
const errorMessage = ref('');
const syncStatus = ref<SyncStatus>({ state: 'idle' });
const isChoosingDirectory = ref(false);
const isSubmitting = ref(false);
const appVersion = `v${__APP_VERSION__}`;
let unsubscribeSyncStatus: (() => void) | null = null;

const isUnlockMode = computed(() => state.value?.requiresPassword === true);
const isMac = computed(() => navigator.userAgent.includes('Macintosh'));
const availableSpace = computed(() => state.value?.availableSpaceBytes ?? null);
const hasEnoughSpace = computed(
  () => availableSpace.value !== null && availableSpace.value > 2 * 1024 ** 3,
);
const encryptionOptions = computed<Array<{ value: EncryptionMethod; label: string }>>(() => {
  const systemOption = isMac.value
    ? { value: 'keychain' as const, label: t('setup.keychain') }
    : { value: 'dpapi' as const, label: t('setup.dpapi') };
  return [systemOption, { value: 'aes-256-gcm', label: t('setup.aes') }];
});
const activeStep = computed(() => (phase.value === 'error' ? 'security' : phase.value));
const primaryLabel = computed(() => {
  if (isUnlockMode.value) return t('setup.unlock');
  if (phase.value === 'security') return t('setup.start');
  if (phase.value === 'complete') return t('setup.finish');
  return t('common.next');
});
const primaryDisabled = computed(() => {
  if (isSubmitting.value) return true;
  if (isUnlockMode.value) return !password.value;
  if (phase.value === 'storage') return !dataDirectory.value.trim() || !hasEnoughSpace.value;
  if (phase.value === 'security' && encryptionMethod.value === 'aes-256-gcm') {
    return !password.value || password.value !== confirmPassword.value;
  }
  if (phase.value === 'sync') return true;
  return false;
});
const statusText = computed(() => {
  if (phase.value === 'sync') {
    if (syncStatus.value.state === 'syncing')
      return t('setup.syncing', {
        page: syncStatus.value.page ?? 0,
        total: syncStatus.value.total ?? 0,
      });
    return t('setup.starting');
  }
  if (phase.value === 'error') return t('setup.failed', { error: errorMessage.value });
  return '';
});

function formatBytes(value: number | null): string {
  if (value === null) return '—';
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
}

function applyLanguage(): void {
  const systemLocale = state.value?.systemLocale || navigator.language;
  locale.value =
    languagePreference.value === 'system'
      ? systemLocale.toLowerCase().startsWith('zh')
        ? 'zh-CN'
        : 'en-US'
      : languagePreference.value;
}

async function validateDirectory(): Promise<boolean> {
  const result = await window.api.validateSetupDataDirectory(dataDirectory.value);
  if (!result.ok) {
    errorMessage.value = result.error;
    phase.value = 'error';
    return false;
  }
  state.value = result.data;
  if (result.data.encryptionLocked && result.data.encryptionMethod) {
    encryptionMethod.value = result.data.encryptionMethod;
  }
  return (
    result.data.availableSpaceBytes !== null && result.data.availableSpaceBytes > 2 * 1024 ** 3
  );
}

async function chooseDirectory(): Promise<void> {
  isChoosingDirectory.value = true;
  try {
    const result = await window.api.chooseSetupDataDirectory(dataDirectory.value);
    if (result.dataDirectory) {
      dataDirectory.value = result.dataDirectory;
      await validateDirectory();
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
    phase.value = 'error';
  } finally {
    isChoosingDirectory.value = false;
  }
}

async function startSetup(): Promise<void> {
  isSubmitting.value = true;
  phase.value = 'sync';
  errorMessage.value = '';
  try {
    const result = await window.api.startInitialSetup({
      dataDirectory: dataDirectory.value,
      localePreference: languagePreference.value,
      encryptionMethod: encryptionMethod.value,
      password: encryptionMethod.value === 'aes-256-gcm' ? password.value : undefined,
      confirmPassword: encryptionMethod.value === 'aes-256-gcm' ? confirmPassword.value : undefined,
    });
    if (!result.ok) throw new Error(result.error);
    state.value = result.data;
    phase.value = 'complete';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
    phase.value = 'error';
  } finally {
    isSubmitting.value = false;
  }
}

async function unlock(): Promise<void> {
  isSubmitting.value = true;
  const result = await window.api.unlockInitialSetup(password.value);
  if (!result.ok) errorMessage.value = result.error;
  isSubmitting.value = false;
}

async function primaryAction(): Promise<void> {
  if (isUnlockMode.value) return await unlock();
  if (phase.value === 'language') {
    applyLanguage();
    phase.value = 'storage';
  } else if (phase.value === 'storage') {
    if (await validateDirectory()) phase.value = 'security';
  } else if (phase.value === 'security') {
    await startSetup();
  } else if (phase.value === 'complete') {
    await window.api.completeInitialSetup();
  }
}

async function cancelSetup(): Promise<void> {
  await window.api.cancelInitialSetup();
}

function previous(): void {
  if (phase.value === 'storage') phase.value = 'language';
  else if (phase.value === 'security') phase.value = 'storage';
}

onMounted(async () => {
  state.value = await window.api.getSetupState();
  dataDirectory.value = state.value.dataDirectory || state.value.defaultDataDirectory;
  languagePreference.value = state.value.localePreference;
  encryptionMethod.value = state.value.encryptionMethod || (isMac.value ? 'keychain' : 'dpapi');
  if (isUnlockMode.value) phase.value = 'security';
  else await validateDirectory();
  unsubscribeSyncStatus = window.api.onSetupSyncStatus((status) => {
    syncStatus.value = status;
  });
});

onUnmounted(() => unsubscribeSyncStatus?.());
</script>

<template>
  <div class="flex h-full flex-col">
    <TitleBar
      :title="t('setup.title')"
      :subtitle="appVersion"
      show-brand-icon
      custom-close
      window-controls="close-only"
      @close="cancelSetup"
    />
    <main class="bg-bg flex min-h-0 flex-1 flex-col">
      <header class="border-border bg-sidebar/70 shrink-0 border-b px-8 py-5">
        <div class="text-muted-light mx-auto flex max-w-4xl items-center gap-4 text-xs">
          <span class="inline-flex items-center gap-2"
            ><Languages :size="15" />{{ t('setup.languageStep') }}</span
          >
          <span>›</span
          ><span class="inline-flex items-center gap-2"
            ><HardDrive :size="15" />{{ t('setup.storageStep') }}</span
          >
          <span>›</span
          ><span class="inline-flex items-center gap-2"
            ><LockKeyhole :size="15" />{{ t('setup.securityStep') }}</span
          >
          <span>›</span
          ><span class="inline-flex items-center gap-2"
            ><Database :size="15" />{{ t('setup.dataStep') }}</span
          >
        </div>
      </header>
      <section class="flex min-h-0 flex-1 items-center justify-center px-8 py-8">
        <div class="border-border bg-surface w-full max-w-2xl rounded-lg border p-8">
          <template v-if="isUnlockMode">
            <h1 class="text-lg font-semibold text-white">{{ t('setup.unlockTitle') }}</h1>
            <p class="text-muted mt-2 text-sm">{{ t('setup.unlockHint') }}</p>
            <input
              v-model="password"
              type="password"
              class="border-border bg-bg text-text mt-6 w-full rounded border px-3 py-2"
              :placeholder="t('setup.password')"
              :aria-label="t('setup.password')"
              @keyup.enter="primaryAction"
            />
            <p v-if="errorMessage" class="text-danger mt-3 text-sm">{{ errorMessage }}</p>
          </template>
          <template v-else-if="activeStep === 'language'">
            <h1 class="text-lg font-semibold text-white">{{ t('setup.language') }}</h1>
            <select
              v-model="languagePreference"
              class="border-border bg-bg text-text mt-6 w-full rounded border px-3 py-2"
              @change="applyLanguage"
            >
              <option value="system">{{ t('setup.systemLanguage') }}</option>
              <option value="en-US">{{ t('setup.english') }}</option>
              <option value="zh-CN">{{ t('setup.chinese') }}</option>
            </select>
          </template>
          <template v-else-if="activeStep === 'storage'">
            <h1 class="text-lg font-semibold text-white">{{ t('setup.dataDirectory') }}</h1>
            <p class="text-muted mt-2 text-sm">{{ t('setup.directoryHint') }}</p>
            <div class="mt-6 flex gap-3">
              <input
                v-model="dataDirectory"
                class="border-border bg-bg text-text min-w-0 flex-1 rounded border px-3 py-2"
                :aria-label="t('setup.dataDirectory')"
                @change="validateDirectory"
              /><button
                type="button"
                class="border-border bg-btn-secondary rounded border px-3"
                :title="t('setup.chooseDirectory')"
                @click="chooseDirectory"
              >
                <LoadingSpinner
                  v-if="isChoosingDirectory"
                  :size="16"
                  :title="t('common.loading')"
                /><FolderOpen v-else :size="17" />
              </button>
            </div>
            <p class="text-muted-light mt-4 text-sm">
              {{ t('setup.availableSpace') }}: {{ formatBytes(availableSpace) }}
            </p>
            <p class="mt-2 text-sm" :class="hasEnoughSpace ? 'text-success' : 'text-danger'">
              {{ t('setup.spaceRequired') }}
            </p>
          </template>
          <template v-else-if="activeStep === 'security'">
            <h1 class="text-lg font-semibold text-white">{{ t('setup.encryptionMethod') }}</h1>
            <p class="text-muted mt-2 text-sm">{{ t('setup.encryptionHint') }}</p>
            <select
              v-model="encryptionMethod"
              class="border-border bg-bg text-text mt-6 w-full rounded border px-3 py-2"
              :disabled="state?.encryptionLocked"
            >
              <option v-for="option in encryptionOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
            <p v-if="state?.encryptionLocked" class="text-muted-light mt-3 text-sm">
              {{ t('setup.existingEncryptionLocked') }}
            </p>
            <template v-if="encryptionMethod === 'aes-256-gcm'"
              ><input
                v-model="password"
                type="password"
                class="border-border bg-bg text-text mt-4 w-full rounded border px-3 py-2"
                :placeholder="t('setup.password')"
                :aria-label="t('setup.password')"
              /><input
                v-model="confirmPassword"
                type="password"
                class="border-border bg-bg text-text mt-3 w-full rounded border px-3 py-2"
                :placeholder="t('setup.confirmPassword')"
                :aria-label="t('setup.confirmPassword')"
              />
              <p
                v-if="confirmPassword && password !== confirmPassword"
                class="text-danger mt-2 text-sm"
              >
                {{ t('setup.passwordsMustMatch') }}
              </p></template
            >
          </template>
          <template v-else-if="activeStep === 'sync'"
            ><div class="flex flex-col items-center">
              <LoadingSpinner :size="28" :title="t('sync.eventSyncing')" />
              <h1 class="mt-5 text-lg font-semibold text-white">{{ t('setup.dataStep') }}</h1>
              <p class="text-muted mt-3 text-sm">{{ statusText }}</p>
            </div></template
          >
          <template v-else-if="activeStep === 'complete'"
            ><div class="flex flex-col items-center">
              <Check class="text-primary" :size="32" />
              <h1 class="mt-5 text-lg font-semibold text-white">{{ t('setup.completed') }}</h1>
            </div></template
          >
          <p v-else class="text-danger text-sm">{{ statusText }}</p>
        </div>
      </section>
      <footer
        class="border-border bg-sidebar/80 flex shrink-0 items-center justify-between border-t px-8 py-4"
      >
        <button
          type="button"
          class="border-border bg-btn-secondary text-text rounded border px-4 py-2 text-sm disabled:opacity-50"
          :disabled="isUnlockMode || phase === 'language' || isSubmitting"
          @click="previous"
        >
          {{ t('common.previous') }}</button
        ><button
          type="button"
          class="bg-primary rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          :disabled="primaryDisabled"
          @click="primaryAction"
        >
          <LoadingSpinner v-if="isSubmitting" :size="15" :title="t('common.loading')" /><span
            v-else
            >{{ primaryLabel }}</span
          >
        </button>
      </footer>
    </main>
  </div>
</template>
