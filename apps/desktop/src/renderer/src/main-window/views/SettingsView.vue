<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Clock,
  Copy,
  Database,
  KeyRound,
  Plug,
  RefreshCw,
  RotateCcw,
  Settings as SettingsIcon,
  UserRound,
  Wrench,
} from '@lucide/vue';
import {
  DEFAULT_ORDER_CONFIRMATION_THRESHOLD_USD,
  LOCAL_MCP_ENDPOINT_URL,
} from '@polytrader/shared';
import type { AppLocalePreference } from '@polytrader/shared';
import type {
  AuthState,
  CacheStats,
  DeveloperModeConfig,
  McpServerConfig,
  McpServerStatus,
  SyncScheduleConfig,
} from '@polytrader/shared';
import { formatNum, formatTimestamp } from '@/shared/utils/format';
import {
  currentLocalePreference,
  currentOrderConfirmationThresholdUsd,
  currentSystemLocale,
  setLocalePreference,
  setOrderConfirmationThresholdUsd,
} from '@/shared/i18n';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';
import { writeClipboardText } from '@/shared/utils/clipboard';

const props = defineProps<{
  syncState: string;
  syncStatus?: string;
  authState: AuthState;
}>();

const emit = defineEmits<{
  'toggle-sync': [];
  'developer-mode-change': [enabled: boolean];
}>();

type SettingsSection = 'general' | 'data' | 'integrations' | 'advanced';

const stats = ref<CacheStats>({
  eventCount: 0,
  marketCount: 0,
  lastSyncAt: null,
});
const schedule = ref<SyncScheduleConfig>({
  enabled: true,
  intervalMinutes: 1,
});
const mcpConfig = ref<McpServerConfig>({
  enabled: false,
  port: 8708,
  token: '',
});
const mcpStatus = ref<McpServerStatus>({
  enabled: false,
  running: false,
  host: '127.0.0.1',
  port: 8708,
  endpoint: LOCAL_MCP_ENDPOINT_URL,
  tokenConfigured: false,
  error: null,
});
const developerMode = ref<DeveloperModeConfig>({
  enabled: false,
});
const loading = ref(false);
const scheduleLoading = ref(false);
const scheduleSaving = ref(false);
const localeSaving = ref(false);
const tradingSafetySaving = ref(false);
const mcpLoading = ref(false);
const mcpSaving = ref(false);
const developerModeLoading = ref(false);
const developerModeSaving = ref(false);
const accountSyncing = ref(false);
const accountSyncError = ref('');
const activeSection = ref<SettingsSection>('general');
const { t } = useI18n();

const localeOptions: Array<{ value: AppLocalePreference; labelKey: string }> = [
  { value: 'system', labelKey: 'language.system' },
  { value: 'en-US', labelKey: 'language.english' },
  { value: 'zh-CN', labelKey: 'language.chinese' },
];

const sectionItems: Array<{ id: SettingsSection; labelKey: string; icon: unknown }> = [
  { id: 'general', labelKey: 'settings.tabs.general', icon: SettingsIcon },
  { id: 'data', labelKey: 'settings.tabs.data', icon: Database },
  { id: 'integrations', labelKey: 'settings.tabs.integrations', icon: Plug },
  { id: 'advanced', labelKey: 'settings.tabs.advanced', icon: Wrench },
];

const isSyncing = () => props.syncState === 'syncing';

function sectionClass(section: SettingsSection): string {
  return activeSection.value === section
    ? 'bg-primary/20 text-primary-light'
    : 'text-muted-light hover:bg-[#1e1e35] hover:text-white';
}

async function loadStats() {
  loading.value = true;
  try {
    stats.value = await window.api.getCacheStats();
  } finally {
    loading.value = false;
  }
}

function clampInterval(value: unknown): number {
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return 1;
  return Math.max(1, Math.min(60, Math.trunc(minutes)));
}

function clampOrderConfirmationThreshold(value: unknown): number {
  const threshold = Number(value);
  if (!Number.isFinite(threshold)) return DEFAULT_ORDER_CONFIRMATION_THRESHOLD_USD;
  return Math.round(Math.max(0, Math.min(100_000, threshold)) * 100) / 100;
}

async function loadSchedule() {
  scheduleLoading.value = true;
  try {
    schedule.value = await window.api.getSyncScheduleConfig();
  } finally {
    scheduleLoading.value = false;
  }
}

function clampMcpPort(value: unknown): number {
  const port = Number(value);
  if (!Number.isFinite(port)) return 8708;
  return Math.max(1024, Math.min(65535, Math.trunc(port)));
}

async function loadMcpServer() {
  mcpLoading.value = true;
  try {
    const [config, status] = await Promise.all([
      window.api.getMcpServerConfig(),
      window.api.getMcpServerStatus(),
    ]);
    mcpConfig.value = config;
    mcpStatus.value = status;
  } finally {
    mcpLoading.value = false;
  }
}

async function loadDeveloperMode() {
  developerModeLoading.value = true;
  try {
    developerMode.value = await window.api.getDeveloperModeConfig();
    emit('developer-mode-change', developerMode.value.enabled);
  } finally {
    developerModeLoading.value = false;
  }
}

async function saveSchedule(config: Partial<SyncScheduleConfig>) {
  scheduleSaving.value = true;
  try {
    schedule.value = await window.api.setSyncScheduleConfig(config);
  } finally {
    scheduleSaving.value = false;
  }
}

async function saveMcpServer(config: Partial<McpServerConfig>) {
  mcpSaving.value = true;
  try {
    mcpConfig.value = await window.api.setMcpServerConfig(config);
    mcpStatus.value = await window.api.getMcpServerStatus();
  } finally {
    mcpSaving.value = false;
  }
}

async function toggleSchedule() {
  await saveSchedule({ enabled: !schedule.value.enabled });
}

async function toggleMcpServer() {
  await saveMcpServer({ enabled: !mcpConfig.value.enabled });
}

async function toggleDeveloperMode() {
  developerModeSaving.value = true;
  try {
    developerMode.value = await window.api.setDeveloperModeConfig({
      enabled: !developerMode.value.enabled,
    });
    emit('developer-mode-change', developerMode.value.enabled);
  } finally {
    developerModeSaving.value = false;
  }
}

async function updateInterval(event: Event) {
  const input = event.target as HTMLInputElement;
  const intervalMinutes = clampInterval(input.value);
  input.value = String(intervalMinutes);
  await saveSchedule({ intervalMinutes });
}

async function updateMcpPort(event: Event) {
  const input = event.target as HTMLInputElement;
  const port = clampMcpPort(input.value);
  input.value = String(port);
  await saveMcpServer({ port });
}

async function resetMcpToken() {
  mcpSaving.value = true;
  try {
    mcpConfig.value = await window.api.resetMcpServerToken();
    mcpStatus.value = await window.api.getMcpServerStatus();
  } finally {
    mcpSaving.value = false;
  }
}

async function copyMcpEndpoint() {
  await writeClipboardText(mcpStatus.value.endpoint);
}

async function copyMcpToken() {
  await writeClipboardText(mcpConfig.value.token);
}

async function updateLocalePreference(event: Event) {
  const input = event.target as HTMLSelectElement;
  localeSaving.value = true;
  try {
    await setLocalePreference(input.value as AppLocalePreference);
  } finally {
    localeSaving.value = false;
  }
}

async function updateOrderConfirmationThreshold(event: Event) {
  const input = event.target as HTMLInputElement;
  const threshold = clampOrderConfirmationThreshold(input.value);
  input.value = String(threshold);
  tradingSafetySaving.value = true;
  try {
    await setOrderConfirmationThresholdUsd(threshold);
  } finally {
    tradingSafetySaving.value = false;
  }
}

async function syncAccountData() {
  accountSyncing.value = true;
  accountSyncError.value = '';
  try {
    const result = await window.api.syncUserData();
    if (!result.ok) {
      accountSyncError.value = result.error;
    }
  } finally {
    accountSyncing.value = false;
  }
}

watch(
  () => props.syncState,
  (state) => {
    if (state === 'done' || state === 'aborted') {
      loadStats();
    }
  },
);

onMounted(async () => {
  await Promise.all([loadStats(), loadSchedule(), loadMcpServer(), loadDeveloperMode()]);
});
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div class="border-border bg-surface flex h-12 shrink-0 items-center gap-3 border-b px-4">
      <div
        class="border-border bg-bg inline-flex min-w-0 items-center gap-1 rounded-md border p-1"
        :aria-label="t('settings.navigation')"
      >
        <button
          v-for="item in sectionItems"
          :key="item.id"
          type="button"
          class="inline-flex h-8 items-center gap-2 rounded px-3 text-sm transition-colors"
          :class="sectionClass(item.id)"
          :title="t(item.labelKey)"
          :aria-pressed="activeSection === item.id"
          @click="activeSection = item.id"
        >
          <component :is="item.icon" :size="15" />
          <span>{{ t(item.labelKey) }}</span>
        </button>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-auto p-6">
      <section v-if="activeSection === 'general'" class="mb-8">
        <h2 class="mb-3 text-sm font-semibold text-white">{{ t('language.label') }}</h2>
        <div class="border-border bg-detail-bg rounded-lg border px-5 py-4">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div class="min-w-0">
              <p class="text-sm font-medium text-white">{{ t('language.label') }}</p>
              <p class="text-muted mt-1 text-sm">{{ t('language.description') }}</p>
              <p class="text-muted mt-1 text-xs">
                {{ t('language.systemLocale') }}: {{ currentSystemLocale || '-' }}
              </p>
            </div>
            <div class="flex items-center gap-3">
              <select
                class="border-border bg-bg text-text focus:border-primary h-9 rounded-md border px-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50"
                :value="currentLocalePreference"
                :disabled="localeSaving"
                :title="t('language.label')"
                :aria-label="t('language.label')"
                @change="updateLocalePreference"
              >
                <option v-for="option in localeOptions" :key="option.value" :value="option.value">
                  {{ t(option.labelKey) }}
                </option>
              </select>
              <LoadingSpinner v-if="localeSaving" :title="t('common.save')" />
            </div>
          </div>
        </div>
      </section>

      <section v-if="activeSection === 'general'" class="mb-8">
        <h2 class="mb-3 text-sm font-semibold text-white">{{ t('settings.tradingSafety') }}</h2>
        <div class="border-border bg-detail-bg rounded-lg border px-5 py-4">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div class="min-w-0">
              <p class="text-sm font-medium text-white">
                {{ t('settings.orderConfirmationThreshold') }}
              </p>
              <p class="text-muted mt-1 text-sm">
                {{ t('settings.orderConfirmationThresholdDescription') }}
              </p>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-muted text-sm">$</span>
              <input
                type="number"
                min="0"
                max="100000"
                step="1"
                class="border-border bg-bg text-text focus:border-primary h-9 w-28 rounded-md border px-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50"
                :value="currentOrderConfirmationThresholdUsd"
                :disabled="tradingSafetySaving"
                :title="t('settings.orderConfirmationThreshold')"
                :aria-label="t('settings.orderConfirmationThreshold')"
                @change="updateOrderConfirmationThreshold"
              />
              <span class="text-muted text-sm">USD</span>
              <LoadingSpinner v-if="tradingSafetySaving" :title="t('common.save')" />
            </div>
          </div>
        </div>
      </section>

      <section v-if="activeSection === 'general'">
        <h2 class="mb-3 text-sm font-semibold text-white">{{ t('auth.accountSync') }}</h2>
        <div class="border-border bg-detail-bg rounded-lg border px-5 py-4">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div class="min-w-0">
              <p class="flex items-center gap-2 text-sm font-medium text-white">
                <UserRound :size="16" class="text-primary-light" />
                <span>{{ authState.email || t('auth.notSignedIn') }}</span>
              </p>
              <p class="text-muted mt-1 text-sm">
                {{
                  authState.configured
                    ? t(`auth.syncState.${authState.syncState}`)
                    : t('auth.configureHint')
                }}
              </p>
              <p v-if="accountSyncError || authState.error" class="mt-2 text-xs text-red-400">
                {{ accountSyncError || authState.error }}
              </p>
            </div>
            <button
              type="button"
              class="bg-primary hover:bg-primary-hover inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="
                accountSyncing ||
                authState.syncState === 'syncing' ||
                authState.status !== 'signed-in'
              "
              @click="syncAccountData"
            >
              <RefreshCw
                :size="16"
                :class="{ 'animate-spin': accountSyncing || authState.syncState === 'syncing' }"
              />
              {{ t('auth.syncNow') }}
            </button>
          </div>
        </div>
      </section>

      <section v-if="activeSection === 'data'" class="mb-8">
        <h2 class="mb-3 text-sm font-semibold text-white">{{ t('settings.localCache') }}</h2>
        <div class="grid gap-4 sm:grid-cols-3">
          <div class="border-border bg-detail-bg rounded-lg border px-5 py-4">
            <p class="text-muted text-xs font-semibold tracking-wide uppercase">
              {{ t('settings.eventData') }}
            </p>
            <p
              class="mt-2 flex min-h-8 items-center text-2xl font-semibold text-white tabular-nums"
            >
              <LoadingSpinner v-if="loading" :size="18" :title="t('settings.loadEventStats')" />
              <template v-else>{{ formatNum(stats.eventCount) }}</template>
            </p>
            <p class="text-muted mt-1 text-xs">
              {{ t('count.events', { count: stats.eventCount }) }}
            </p>
          </div>
          <div class="border-border bg-detail-bg rounded-lg border px-5 py-4">
            <p class="text-muted text-xs font-semibold tracking-wide uppercase">
              {{ t('settings.marketData') }}
            </p>
            <p
              class="mt-2 flex min-h-8 items-center text-2xl font-semibold text-white tabular-nums"
            >
              <LoadingSpinner v-if="loading" :size="18" :title="t('settings.loadMarketStats')" />
              <template v-else>{{ formatNum(stats.marketCount) }}</template>
            </p>
            <p class="text-muted mt-1 text-xs">
              {{ t('count.markets', { count: stats.marketCount }) }}
            </p>
          </div>
          <div class="border-border bg-detail-bg rounded-lg border px-5 py-4">
            <p class="text-muted text-xs font-semibold tracking-wide uppercase">
              {{ t('settings.lastSyncTime') }}
            </p>
            <p class="mt-2 text-lg font-semibold text-white">
              {{ stats.lastSyncAt ? formatTimestamp(stats.lastSyncAt) : '—' }}
            </p>
            <p class="text-muted mt-1 text-xs">{{ t('settings.fromPolymarketApi') }}</p>
          </div>
        </div>
      </section>

      <section v-if="activeSection === 'data'" class="mb-8">
        <h2 class="mb-3 text-sm font-semibold text-white">{{ t('settings.dataSync') }}</h2>
        <div class="border-border bg-detail-bg rounded-lg border px-5 py-4">
          <p class="text-muted text-sm">
            {{ t('settings.syncDescription') }}
          </p>
          <div class="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors"
              :class="isSyncing() ? 'bg-primary/60' : 'bg-primary hover:bg-primary-hover'"
              :disabled="isSyncing()"
              @click="emit('toggle-sync')"
            >
              <RefreshCw :size="16" :class="{ 'animate-spin': isSyncing() }" />
              {{ t('settings.startSync') }}
            </button>
            <LoadingSpinner v-if="isSyncing()" :title="t('settings.syncData')" />
            <span class="text-muted text-sm">{{ syncStatus || t('settings.notSyncedYet') }}</span>
          </div>
        </div>
      </section>

      <section v-if="activeSection === 'integrations'">
        <h2 class="mb-3 text-sm font-semibold text-white">{{ t('settings.mcpServer') }}</h2>
        <div class="border-border bg-detail-bg rounded-lg border px-5 py-4">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div class="min-w-0">
              <p class="text-sm font-medium text-white">{{ t('settings.localMcpServer') }}</p>
              <p class="text-muted mt-1 text-sm">{{ t('settings.mcpDescription') }}</p>
              <p class="mt-2 flex min-w-0 items-center gap-2 font-mono text-xs text-white">
                <Plug :size="14" class="text-muted shrink-0" />
                <span class="selectable-text truncate" :title="mcpStatus.endpoint">
                  {{ mcpStatus.endpoint }}
                </span>
                <button
                  type="button"
                  class="hover:bg-btn-secondary text-muted-light inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors hover:text-white"
                  :title="t('settings.copyMcpEndpoint')"
                  :aria-label="t('settings.copyMcpEndpoint')"
                  @click="copyMcpEndpoint"
                >
                  <Copy :size="14" />
                </button>
              </p>
              <p
                class="mt-2 text-xs"
                :class="
                  mcpStatus.error
                    ? 'text-red-400'
                    : mcpStatus.running
                      ? 'text-emerald-400'
                      : 'text-muted'
                "
              >
                {{
                  mcpStatus.error ||
                  (mcpStatus.running ? t('settings.mcpRunning') : t('settings.mcpStopped'))
                }}
              </p>
            </div>
            <button
              type="button"
              class="inline-flex h-8 w-14 items-center rounded-full border px-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              :class="
                mcpConfig.enabled
                  ? 'border-primary bg-primary/25 justify-end'
                  : 'border-border bg-bg justify-start'
              "
              :disabled="mcpLoading || mcpSaving"
              :aria-pressed="mcpConfig.enabled"
              @click="toggleMcpServer"
            >
              <span class="block h-5 w-5 rounded-full bg-white shadow-sm" />
            </button>
          </div>

          <div class="border-border mt-5 flex flex-wrap items-center gap-3 border-t pt-4">
            <label for="mcp-port" class="text-muted text-sm">
              {{ t('settings.mcpPort') }}
            </label>
            <input
              id="mcp-port"
              type="number"
              min="1024"
              max="65535"
              step="1"
              class="border-border bg-bg text-text focus:border-primary h-8 w-28 rounded-md border px-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50"
              :value="mcpConfig.port"
              :disabled="mcpLoading || mcpSaving"
              @change="updateMcpPort"
            />
            <span class="text-muted text-sm">127.0.0.1</span>
            <LoadingSpinner v-if="mcpSaving" :title="t('settings.saveMcpServer')" />
          </div>

          <div class="border-border mt-4 flex flex-wrap items-center gap-3 border-t pt-4">
            <KeyRound :size="16" class="text-muted" />
            <span class="text-muted text-sm">{{ t('settings.mcpToken') }}</span>
            <code
              class="selectable-text border-border bg-bg text-muted-light max-w-full truncate rounded-md border px-2 py-1 font-mono text-xs"
              :title="mcpConfig.token"
            >
              {{ mcpConfig.token }}
            </code>
            <button
              type="button"
              class="hover:bg-btn-secondary text-muted-light inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:text-white disabled:opacity-50"
              :title="t('settings.copyMcpToken')"
              :aria-label="t('settings.copyMcpToken')"
              :disabled="mcpLoading || !mcpConfig.token"
              @click="copyMcpToken"
            >
              <Copy :size="14" />
            </button>
            <button
              type="button"
              class="border-border text-text inline-flex h-8 items-center gap-2 rounded-md border bg-[#1e1e35] px-3 text-sm transition-colors hover:bg-[#2a2a45] disabled:opacity-50"
              :disabled="mcpLoading || mcpSaving"
              @click="resetMcpToken"
            >
              <RotateCcw :size="14" />
              {{ t('settings.resetMcpToken') }}
            </button>
          </div>
        </div>
      </section>

      <section v-if="activeSection === 'advanced'">
        <h2 class="mb-3 text-sm font-semibold text-white">{{ t('settings.developerMode') }}</h2>
        <div class="border-border bg-detail-bg rounded-lg border px-5 py-4">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div class="min-w-0">
              <p class="text-sm font-medium text-white">{{ t('settings.enableDeveloperMode') }}</p>
              <p class="text-muted mt-1 text-sm">{{ t('settings.developerModeDescription') }}</p>
            </div>
            <div class="flex items-center gap-3">
              <LoadingSpinner v-if="developerModeSaving" :title="t('settings.saveDeveloperMode')" />
              <button
                type="button"
                class="inline-flex h-8 w-14 items-center rounded-full border px-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                :class="
                  developerMode.enabled
                    ? 'border-primary bg-primary/25 justify-end'
                    : 'border-border bg-bg justify-start'
                "
                :disabled="developerModeLoading || developerModeSaving"
                :aria-pressed="developerMode.enabled"
                @click="toggleDeveloperMode"
              >
                <span class="block h-5 w-5 rounded-full bg-white shadow-sm" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <section v-if="activeSection === 'data'">
        <h2 class="mb-3 text-sm font-semibold text-white">{{ t('settings.scheduledSync') }}</h2>
        <div class="border-border bg-detail-bg rounded-lg border px-5 py-4">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div class="min-w-0">
              <p class="text-sm font-medium text-white">{{ t('settings.autoSync') }}</p>
              <p class="text-muted mt-1 text-sm">{{ t('settings.scheduleDescription') }}</p>
            </div>
            <button
              type="button"
              class="inline-flex h-8 w-14 items-center rounded-full border px-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              :class="
                schedule.enabled
                  ? 'border-primary bg-primary/25 justify-end'
                  : 'border-border bg-bg justify-start'
              "
              :disabled="scheduleLoading || scheduleSaving"
              :aria-pressed="schedule.enabled"
              @click="toggleSchedule"
            >
              <span class="block h-5 w-5 rounded-full bg-white shadow-sm" />
            </button>
          </div>

          <div class="border-border mt-5 flex flex-wrap items-center gap-3 border-t pt-4">
            <Clock :size="16" class="text-muted" />
            <label for="sync-interval" class="text-muted text-sm">
              {{ t('settings.syncInterval') }}
            </label>
            <input
              id="sync-interval"
              type="number"
              min="1"
              max="60"
              step="1"
              class="border-border bg-bg text-text focus:border-primary h-8 w-24 rounded-md border px-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50"
              :value="schedule.intervalMinutes"
              :disabled="scheduleLoading || scheduleSaving"
              @change="updateInterval"
            />
            <span class="text-muted text-sm">{{ t('common.minutes') }}</span>
            <LoadingSpinner v-if="scheduleSaving" :title="t('settings.saveSchedule')" />
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
