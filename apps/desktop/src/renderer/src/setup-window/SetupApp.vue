<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Check, Database, FolderOpen, HardDrive } from '@lucide/vue';
import type { SetupState, SyncStatus } from '@polytrader/shared';
import { useI18n } from 'vue-i18n';
import TitleBar from '../shared/components/TitleBar.vue';
import LoadingSpinner from '../shared/components/LoadingSpinner.vue';

type SetupPhase = 'storage' | 'sync' | 'complete' | 'error';

const { t } = useI18n();
const state = ref<SetupState | null>(null);
const dataDirectory = ref('');
const phase = ref<SetupPhase>('storage');
const errorMessage = ref('');
const syncStatus = ref<SyncStatus>({ state: 'idle' });
const isChoosingDirectory = ref(false);
const isStarting = ref(false);
const isCompleting = ref(false);
const storageLocked = ref(false);
const appVersion = `v${__APP_VERSION__}`;
let unsubscribeSyncStatus: (() => void) | null = null;

const activeStep = computed<SetupPhase>(() => (phase.value === 'error' ? 'sync' : phase.value));
const canStart = computed(
  () => dataDirectory.value.trim().length > 0 && !isStarting.value && !isChoosingDirectory.value,
);
const canGoBack = computed(() => activeStep.value === 'sync' && !storageLocked.value);
const primaryLabel = computed(() => {
  if (phase.value === 'complete') return t('setup.finish');
  return t('common.next');
});
const primaryDisabled = computed(() => {
  if (phase.value === 'storage') return !canStart.value;
  if (phase.value === 'complete') return isCompleting.value;
  return true;
});

const statusText = computed(() => {
  if (phase.value === 'sync') {
    if (syncStatus.value.state === 'syncing') {
      return t('setup.syncing', {
        page: syncStatus.value.page ?? 0,
        total: syncStatus.value.total ?? 0,
      });
    }
    if (syncStatus.value.state === 'done') {
      return t('setup.synced', { total: syncStatus.value.total ?? 0 });
    }
    return t('setup.starting');
  }

  if (phase.value === 'complete') return t('setup.openMainWindow');
  if (phase.value === 'error') return t('setup.failed', { error: errorMessage.value });
  return t('setup.directoryHint');
});

const syncCount = computed(() => syncStatus.value.total ?? state.value?.cacheStats?.eventCount ?? 0);

function stepClass(step: SetupPhase): string {
  const order: SetupPhase[] = ['storage', 'sync', 'complete'];
  const activeIndex = order.indexOf(activeStep.value);
  const stepIndex = order.indexOf(step);
  if (stepIndex < activeIndex) return 'border-primary bg-primary text-white';
  if (stepIndex === activeIndex) return 'border-primary-light text-primary-light';
  return 'border-border text-muted-light';
}

async function chooseDirectory(): Promise<void> {
  if (storageLocked.value) return;
  isChoosingDirectory.value = true;
  errorMessage.value = '';
  try {
    const result = await window.api.chooseSetupDataDirectory(dataDirectory.value);
    if (!result.canceled && result.dataDirectory) {
      dataDirectory.value = result.dataDirectory;
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
    phase.value = 'error';
  } finally {
    isChoosingDirectory.value = false;
  }
}

async function startSetup(): Promise<void> {
  if (!canStart.value) return;
  isStarting.value = true;
  storageLocked.value = true;
  phase.value = 'sync';
  errorMessage.value = '';
  syncStatus.value = { state: 'idle' };
  try {
    const result = await window.api.startInitialSetup({ dataDirectory: dataDirectory.value });
    if (!result.ok) {
      errorMessage.value = result.error;
      phase.value = 'error';
      if (syncStatus.value.state === 'idle') storageLocked.value = false;
      return;
    }
    state.value = result.data;
    phase.value = 'complete';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
    phase.value = 'error';
    if (syncStatus.value.state === 'idle') storageLocked.value = false;
  } finally {
    isStarting.value = false;
  }
}

function goBack(): void {
  if (!canGoBack.value) return;
  phase.value = 'storage';
  errorMessage.value = '';
}

async function completeSetup(): Promise<void> {
  if (isCompleting.value) return;
  isCompleting.value = true;
  try {
    await window.api.completeInitialSetup();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
    phase.value = 'error';
    isCompleting.value = false;
  }
}

function handlePrimaryAction(): void {
  if (phase.value === 'storage') {
    void startSetup();
    return;
  }
  if (phase.value === 'complete') {
    void completeSetup();
  }
}

async function cancelSetup(): Promise<void> {
  await window.api.cancelInitialSetup();
}

onMounted(async () => {
  state.value = await window.api.getSetupState();
  dataDirectory.value = state.value.dataDirectory || state.value.defaultDataDirectory;
  unsubscribeSyncStatus = window.api.onSetupSyncStatus((status) => {
    syncStatus.value = status;
    if (status.state === 'error') {
      errorMessage.value = status.error || t('common.unknown');
      phase.value = 'error';
    }
  });
});

onUnmounted(() => {
  unsubscribeSyncStatus?.();
});
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

    <main class="flex min-h-0 flex-1 flex-col bg-bg">
      <header class="border-border bg-sidebar/70 shrink-0 border-b px-8 py-5">
        <div class="mx-auto flex max-w-4xl items-center justify-between gap-6">
          <div class="min-w-0">
            <h1 class="text-lg font-semibold text-white">{{ t('setup.headline') }}</h1>
            <p class="text-muted mt-1 truncate text-xs">{{ t('setup.description') }}</p>
          </div>

          <div class="flex shrink-0 items-center gap-3">
            <span class="flex items-center gap-2">
              <span
                class="flex h-8 w-8 items-center justify-center rounded-full border"
                :class="stepClass('storage')"
              >
                <HardDrive :size="15" />
              </span>
              <span class="text-xs text-muted-light">{{ t('setup.storageStep') }}</span>
            </span>
            <span class="h-px w-8 bg-border" />
            <span class="flex items-center gap-2">
              <span
                class="flex h-8 w-8 items-center justify-center rounded-full border"
                :class="stepClass('sync')"
              >
                <Database :size="15" />
              </span>
              <span class="text-xs text-muted-light">{{ t('setup.dataStep') }}</span>
            </span>
            <span class="h-px w-8 bg-border" />
            <span class="flex items-center gap-2">
              <span
                class="flex h-8 w-8 items-center justify-center rounded-full border"
                :class="stepClass('complete')"
              >
                <Check :size="15" />
              </span>
              <span class="text-xs text-muted-light">{{ t('setup.doneStep') }}</span>
            </span>
          </div>
        </div>
      </header>

      <section class="flex min-h-0 flex-1 items-center justify-center px-8 py-8">
        <div class="border-border bg-surface w-full max-w-3xl rounded-lg border p-8">
          <div v-if="activeStep === 'storage'" class="space-y-6">
            <div class="flex items-start gap-4">
              <div
                class="bg-primary/15 text-primary-light flex h-11 w-11 shrink-0 items-center justify-center rounded"
              >
                <HardDrive :size="21" />
              </div>
              <div class="min-w-0">
                <h2 class="text-base font-semibold text-white">{{ t('setup.dataDirectory') }}</h2>
                <p class="text-muted mt-2 text-sm leading-6">{{ t('setup.directoryHint') }}</p>
              </div>
            </div>

            <div class="space-y-2">
              <label class="text-muted-light text-xs">{{ t('setup.dataDirectory') }}</label>
              <div class="flex min-w-0 gap-3">
              <input
                v-model="dataDirectory"
                class="border-border bg-bg text-text min-w-0 flex-1 rounded border px-3 py-2 text-sm outline-none focus:border-primary"
                :disabled="isStarting || storageLocked"
                :aria-label="t('setup.dataDirectory')"
              />
              <button
                type="button"
                class="border-border bg-btn-secondary hover:bg-btn-secondary-hover inline-flex h-10 w-10 shrink-0 items-center justify-center rounded border text-muted-light transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
                :title="t('setup.chooseDirectory')"
                :disabled="isStarting || isChoosingDirectory || storageLocked"
                @click="chooseDirectory"
              >
                <LoadingSpinner v-if="isChoosingDirectory" :size="16" :title="t('common.loading')" />
                <FolderOpen v-else :size="17" />
              </button>
              </div>
            </div>

            <div class="text-muted mt-3 truncate text-xs" :title="state?.defaultDataDirectory">
              {{ t('setup.defaultDirectory') }}: {{ state?.defaultDataDirectory }}
            </div>
          </div>

          <div v-else-if="activeStep === 'sync'" class="flex flex-col items-center text-center">
            <div
              class="border-border bg-bg flex h-16 w-16 items-center justify-center rounded-full border"
            >
              <LoadingSpinner v-if="phase !== 'error'" :size="28" :title="t('sync.eventSyncing')" />
              <Database v-else :size="28" class="text-danger" />
            </div>

            <h2 class="mt-5 text-base font-semibold text-white">{{ t('setup.dataStep') }}</h2>
            <p class="text-muted mt-2 max-w-md text-sm leading-6">{{ t('setup.syncHint') }}</p>

            <div class="mt-8 text-4xl font-semibold tabular-nums text-white">
              {{ syncCount.toLocaleString() }}
            </div>
            <div class="text-muted mt-1 text-xs">{{ t('setup.eventCount') }}</div>

            <p
              class="mt-6 min-h-6 text-sm leading-6"
              :class="phase === 'error' ? 'text-danger' : 'text-muted-light'"
            >
              {{ statusText }}
            </p>
          </div>

          <div v-else class="flex flex-col items-center text-center">
            <div
              class="border-primary bg-primary text-white flex h-16 w-16 items-center justify-center rounded-full border"
            >
              <Check :size="30" />
            </div>
            <h2 class="mt-5 text-base font-semibold text-white">{{ t('setup.completed') }}</h2>
            <p class="text-muted mt-2 max-w-md text-sm leading-6">
              {{ t('setup.openMainWindow') }}
            </p>
            <div class="mt-8 text-4xl font-semibold tabular-nums text-white">
              {{ syncCount.toLocaleString() }}
            </div>
            <div class="text-muted mt-1 text-xs">{{ t('setup.eventCount') }}</div>
          </div>
        </div>
      </section>

      <footer
        class="border-border bg-sidebar/80 flex shrink-0 items-center justify-between border-t px-8 py-4"
      >
        <button
          type="button"
          class="border-border bg-btn-secondary hover:bg-btn-secondary-hover inline-flex h-9 min-w-24 items-center justify-center rounded border px-4 text-sm text-text transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="!canGoBack || isStarting || isCompleting"
          @click="goBack"
        >
          {{ t('common.previous') }}
        </button>

        <button
          type="button"
          class="bg-primary hover:bg-primary-hover inline-flex h-9 min-w-24 items-center justify-center gap-2 rounded px-4 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="primaryDisabled"
          @click="handlePrimaryAction"
        >
          <LoadingSpinner
            v-if="isStarting || isCompleting"
            :size="15"
            :title="t('common.loading')"
          />
          <span>{{ primaryLabel }}</span>
        </button>
      </footer>
    </main>
  </div>
</template>
