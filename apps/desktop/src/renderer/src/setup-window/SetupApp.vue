<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Check, Database, FolderOpen, HardDrive, RefreshCw } from '@lucide/vue';
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
const storageLocked = ref(false);
const appVersion = `v${__APP_VERSION__}`;
let unsubscribeSyncStatus: (() => void) | null = null;

const canStart = computed(
  () => dataDirectory.value.trim().length > 0 && !isStarting.value && !isChoosingDirectory.value,
);

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
  const activeIndex = order.indexOf(phase.value === 'error' ? 'sync' : phase.value);
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
    <TitleBar :title="t('setup.title')" :subtitle="appVersion" show-brand-icon />

    <main class="flex min-h-0 flex-1 flex-col bg-bg">
      <section class="border-border bg-sidebar/70 border-b px-10 py-8">
        <div class="mx-auto flex max-w-5xl items-center justify-between gap-8">
          <div class="min-w-0">
            <h1 class="text-2xl font-semibold text-white">{{ t('setup.headline') }}</h1>
            <p class="text-muted-light mt-2 max-w-2xl text-sm leading-6">
              {{ t('setup.description') }}
            </p>
          </div>

          <div class="flex shrink-0 items-center gap-3">
            <div class="flex items-center gap-2">
              <span
                class="flex h-9 w-9 items-center justify-center rounded-full border"
                :class="stepClass('storage')"
              >
                <HardDrive :size="17" />
              </span>
              <span class="text-sm text-muted-light">{{ t('setup.storageStep') }}</span>
            </div>
            <div class="h-px w-10 bg-border" />
            <div class="flex items-center gap-2">
              <span
                class="flex h-9 w-9 items-center justify-center rounded-full border"
                :class="stepClass('sync')"
              >
                <Database :size="17" />
              </span>
              <span class="text-sm text-muted-light">{{ t('setup.dataStep') }}</span>
            </div>
            <div class="h-px w-10 bg-border" />
            <div class="flex items-center gap-2">
              <span
                class="flex h-9 w-9 items-center justify-center rounded-full border"
                :class="stepClass('complete')"
              >
                <Check :size="17" />
              </span>
              <span class="text-sm text-muted-light">{{ t('setup.doneStep') }}</span>
            </div>
          </div>
        </div>
      </section>

      <section class="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-10 py-10">
        <div class="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div class="border-border bg-surface rounded-lg border p-6">
            <div class="flex items-center gap-3">
              <div class="bg-primary/15 text-primary-light flex h-10 w-10 items-center justify-center rounded">
                <HardDrive :size="20" />
              </div>
              <div class="min-w-0">
                <h2 class="text-base font-semibold text-white">{{ t('setup.dataDirectory') }}</h2>
                <p class="text-muted mt-1 text-xs">{{ t('setup.directoryHint') }}</p>
              </div>
            </div>

            <div class="mt-5 flex min-w-0 gap-3">
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

            <div class="text-muted mt-3 truncate text-xs" :title="state?.defaultDataDirectory">
              {{ t('setup.defaultDirectory') }}: {{ state?.defaultDataDirectory }}
            </div>

            <div class="mt-6 flex items-center justify-between gap-4">
              <p class="text-muted-light min-w-0 text-sm">{{ t('setup.syncHint') }}</p>
              <button
                type="button"
                class="bg-primary hover:bg-primary-hover inline-flex h-10 shrink-0 items-center gap-2 rounded px-4 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="!canStart"
                @click="startSetup"
              >
                <LoadingSpinner v-if="isStarting" :size="16" :title="t('common.loading')" />
                <RefreshCw v-else :size="16" />
                <span>{{ t('setup.start') }}</span>
              </button>
            </div>
          </div>

          <div class="border-border bg-surface rounded-lg border p-6">
            <div class="flex items-center justify-between gap-3">
              <h2 class="text-base font-semibold text-white">{{ t('common.status') }}</h2>
              <LoadingSpinner
                v-if="phase === 'sync' || phase === 'complete'"
                :size="18"
                :title="t('sync.eventSyncing')"
              />
            </div>

            <div class="mt-6">
              <div class="text-3xl font-semibold tabular-nums text-white">
                {{ syncCount.toLocaleString() }}
              </div>
              <div class="text-muted mt-1 text-xs">{{ t('setup.dataStep') }}</div>
            </div>

            <p
              class="mt-6 min-h-12 text-sm leading-6"
              :class="phase === 'error' ? 'text-danger' : 'text-muted-light'"
            >
              {{ statusText }}
            </p>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
