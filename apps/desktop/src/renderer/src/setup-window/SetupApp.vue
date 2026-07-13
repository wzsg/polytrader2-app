<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  Check,
  Database,
  FolderOpen,
  HardDrive,
  KeyRound,
  LockKeyhole,
  Languages,
  ShieldCheck,
} from '@lucide/vue';
import type { AppLocale, AppLocalePreference, SetupState, SyncStatus } from '@polytrader/shared';
import { useI18n } from 'vue-i18n';
import TitleBar from '../shared/components/TitleBar.vue';
import LoadingSpinner from '../shared/components/LoadingSpinner.vue';
import chinaLocaleIcon from '../assets/locale/china.png';
import usLocaleIcon from '../assets/locale/us.png';

type SetupPhase = 'language' | 'storage' | 'security' | 'sync' | 'complete' | 'error';
type EncryptionMethod = 'keychain' | 'dpapi' | 'aes-256-gcm';
type SetupStep = 'language' | 'storage' | 'security' | 'data';

const { t, locale } = useI18n();
const state = ref<SetupState | null>(null);
const dataDirectory = ref('');
const languagePreference = ref<AppLocale>('en-US');
const encryptionMethod = ref<EncryptionMethod>('aes-256-gcm');
const password = ref('');
const confirmPassword = ref('');
const phase = ref<SetupPhase>('language');
const errorStep = ref<'storage' | 'security'>('security');
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
const encryptionOptions = computed<
  Array<{
    value: EncryptionMethod;
    label: string;
    description: string;
    recommended: boolean;
    icon: typeof ShieldCheck;
  }>
>(() => {
  const systemOption = isMac.value
    ? { value: 'keychain' as const, label: t('setup.keychain') }
    : { value: 'dpapi' as const, label: t('setup.dpapi') };
  return [
    {
      ...systemOption,
      description: t('setup.systemEncryptionDescription'),
      recommended: true,
      icon: ShieldCheck,
    },
    {
      value: 'aes-256-gcm',
      label: t('setup.aes'),
      description: t('setup.passwordEncryptionDescription'),
      recommended: false,
      icon: KeyRound,
    },
  ];
});
const languageOptions = computed(() => {
  const systemLanguage = getSystemSetupLanguage();
  const options = [
    { value: 'en-US' as const, label: t('setup.english'), icon: usLocaleIcon },
    { value: 'zh-CN' as const, label: t('setup.chinese'), icon: chinaLocaleIcon },
  ];
  return options.sort((left, right) => {
    return Number(right.value === systemLanguage) - Number(left.value === systemLanguage);
  });
});
const activeStep = computed(() => (phase.value === 'error' ? errorStep.value : phase.value));
const primaryLabel = computed(() => {
  if (isUnlockMode.value) return t('setup.unlock');
  if (phase.value === 'error') return t('common.retry');
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
const syncProgressPercent = computed(() => {
  const value = syncStatus.value.progressPercent ?? 0;
  return Math.min(100, Math.max(0, Math.round(value)));
});
const syncProgressDashOffset = computed(() => 326.73 * (1 - syncProgressPercent.value / 100));
const statusText = computed(() => {
  if (phase.value === 'sync') {
    if (syncStatus.value.state === 'syncing')
      return t('setup.syncing', {
        page: syncStatus.value.page ?? 0,
        completedEvents: syncStatus.value.completedEvents ?? 0,
        totalEvents: syncStatus.value.totalEvents ?? 0,
        progressPercent: syncStatus.value.progressPercent ?? 0,
      });
    if (syncStatus.value.state === 'finalizing')
      return t('setup.finalizing', { progressPercent: syncStatus.value.progressPercent ?? 100 });
    return t('setup.starting');
  }
  if (phase.value === 'error') return t('setup.failed', { error: errorMessage.value });
  return '';
});

function formatBytes(value: number | null): string {
  if (value === null) return '—';
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
}

function getSystemSetupLanguage(): AppLocale {
  const systemLocale = state.value?.systemLocale || navigator.language;
  return systemLocale.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
}

function resolveSetupLanguagePreference(preference: AppLocalePreference): AppLocale {
  return preference === 'system' ? getSystemSetupLanguage() : preference;
}

function applyLanguage(): void {
  locale.value = languagePreference.value;
}

function selectLanguage(preference: AppLocale): void {
  languagePreference.value = preference;
  applyLanguage();
}

function isCurrentSetupStep(step: SetupStep): boolean {
  if (step === 'data') return activeStep.value === 'sync' || activeStep.value === 'complete';
  return activeStep.value === step;
}

async function validateDirectory(): Promise<boolean> {
  errorMessage.value = '';
  const result = await window.api.validateSetupDataDirectory(dataDirectory.value);
  if (!result.ok) {
    errorMessage.value = result.error;
    errorStep.value = 'storage';
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
    errorStep.value = 'storage';
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
    errorStep.value = 'security';
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
  } else if (phase.value === 'error' && errorStep.value === 'storage') {
    if (await validateDirectory()) phase.value = 'security';
  } else if (phase.value === 'error') {
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
  else if (phase.value === 'error') {
    phase.value = errorStep.value === 'storage' ? 'language' : 'storage';
    errorMessage.value = '';
  }
}

onMounted(async () => {
  state.value = await window.api.getSetupState();
  dataDirectory.value = state.value.dataDirectory || state.value.defaultDataDirectory;
  languagePreference.value = resolveSetupLanguagePreference(state.value.localePreference);
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
      <header class="border-border bg-sidebar/70 shrink-0 border-b px-8 py-4">
        <div
          class="text-muted-light flex items-center justify-center gap-2 text-xs"
          :aria-label="t('setup.title')"
        >
          <span
            class="inline-flex items-center gap-2 rounded px-3 py-2 transition-colors"
            :class="isCurrentSetupStep('language') ? 'bg-primary/15 text-primary' : ''"
            :aria-current="isCurrentSetupStep('language') ? 'step' : undefined"
            ><Languages :size="15" />{{ t('setup.languageStep') }}</span
          >
          <span class="text-border">›</span
          ><span
            class="inline-flex items-center gap-2 rounded px-3 py-2 transition-colors"
            :class="isCurrentSetupStep('storage') ? 'bg-primary/15 text-primary' : ''"
            :aria-current="isCurrentSetupStep('storage') ? 'step' : undefined"
            ><HardDrive :size="15" />{{ t('setup.storageStep') }}</span
          >
          <span class="text-border">›</span
          ><span
            class="inline-flex items-center gap-2 rounded px-3 py-2 transition-colors"
            :class="isCurrentSetupStep('security') ? 'bg-primary/15 text-primary' : ''"
            :aria-current="isCurrentSetupStep('security') ? 'step' : undefined"
            ><LockKeyhole :size="15" />{{ t('setup.securityStep') }}</span
          >
          <span class="text-border">›</span
          ><span
            class="inline-flex items-center gap-2 rounded px-3 py-2 transition-colors"
            :class="isCurrentSetupStep('data') ? 'bg-primary/15 text-primary' : ''"
            :aria-current="isCurrentSetupStep('data') ? 'step' : undefined"
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
            <div class="mt-6 grid gap-3" role="radiogroup" :aria-label="t('setup.language')">
              <button
                v-for="option in languageOptions"
                :key="option.value"
                type="button"
                role="radio"
                :aria-checked="languagePreference === option.value"
                class="border-border bg-bg hover:border-primary flex items-center gap-3 rounded border px-4 py-3 text-left transition-colors"
                :class="languagePreference === option.value ? 'border-primary bg-primary/10' : ''"
                @click="selectLanguage(option.value)"
              >
                <img class="size-10 rounded object-cover" :src="option.icon" alt="" />
                <span class="text-text text-sm font-medium">{{ option.label }}</span>
                <Check
                  v-if="languagePreference === option.value"
                  class="text-primary ml-auto"
                  :size="19"
                />
              </button>
            </div>
          </template>
          <template v-else-if="activeStep === 'storage'">
            <h1 class="text-lg font-semibold text-white">{{ t('setup.dataDirectory') }}</h1>
            <p class="text-muted mt-2 text-sm">{{ t('setup.directoryHint') }}</p>
            <div class="mt-6 flex gap-3">
              <input
                v-model="dataDirectory"
                spellcheck="false"
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
            <div
              class="mt-6 grid gap-3"
              role="radiogroup"
              :aria-label="t('setup.encryptionMethod')"
            >
              <button
                v-for="option in encryptionOptions"
                :key="option.value"
                type="button"
                role="radio"
                :aria-checked="encryptionMethod === option.value"
                :disabled="state?.encryptionLocked"
                class="border-border bg-bg hover:border-primary flex items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                :class="encryptionMethod === option.value ? 'border-primary bg-primary/10' : ''"
                @click="encryptionMethod = option.value"
              >
                <span
                  class="border-border bg-surface mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border"
                  :class="
                    encryptionMethod === option.value
                      ? 'border-primary/40 text-primary'
                      : 'text-muted'
                  "
                >
                  <component :is="option.icon" :size="18" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="flex items-center gap-2">
                    <span class="text-text text-sm font-medium">{{ option.label }}</span>
                    <span
                      v-if="option.recommended"
                      class="bg-primary/15 text-primary rounded px-1.5 py-0.5 text-[10px] font-medium"
                    >
                      {{ t('setup.recommended') }}
                    </span>
                  </span>
                  <span class="text-muted mt-1 block text-xs leading-5">
                    {{ option.description }}
                  </span>
                </span>
                <Check
                  v-if="encryptionMethod === option.value"
                  class="text-primary mt-1 shrink-0"
                  :size="18"
                />
              </button>
            </div>
            <p v-if="state?.encryptionLocked" class="text-muted-light mt-3 text-sm">
              {{ t('setup.existingEncryptionLocked') }}
            </p>
            <p v-if="errorMessage" class="text-danger mt-3 text-sm" role="alert">
              {{ errorMessage }}
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
          <template v-else-if="activeStep === 'sync'">
            <div class="flex flex-col items-center">
              <div
                class="relative size-40"
                role="progressbar"
                :aria-label="t('sync.eventSyncing')"
                :aria-valuemin="0"
                :aria-valuemax="100"
                :aria-valuenow="syncProgressPercent"
              >
                <svg class="size-full -rotate-90" viewBox="0 0 120 120" aria-hidden="true">
                  <circle
                    class="stroke-border"
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    stroke-width="8"
                  />
                  <circle
                    class="stroke-primary transition-[stroke-dashoffset] duration-300 ease-out"
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    stroke-width="8"
                    stroke-linecap="round"
                    stroke-dasharray="326.73"
                    :style="{ strokeDashoffset: syncProgressDashOffset }"
                  />
                </svg>
                <div class="absolute inset-0 flex flex-col items-center justify-center">
                  <span class="text-3xl font-semibold text-white tabular-nums">
                    {{ syncProgressPercent }}%
                  </span>
                  <span class="text-muted-light mt-1 text-xs">{{ t('setup.dataStep') }}</span>
                </div>
              </div>
              <p class="text-muted mt-6 text-center text-sm" aria-live="polite">{{ statusText }}</p>
            </div>
          </template>
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
