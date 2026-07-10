<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Bot,
  Copy,
  History,
  PanelBottomClose,
  PanelBottomOpen,
  Pencil,
  Play,
  ReceiptText,
  Save,
  ScrollText,
  Square,
  Trash2,
  X,
} from '@lucide/vue';
import type {
  StrategyBotListItem,
  StrategyListItem,
  StrategyRunListItem,
  StrategyRunLogEntry,
  StrategyRunOrderRecord,
  StrategyVersionSummary,
  PolymarketWalletSummary,
} from '@polytrader/shared';
import ContextMenu, { type ContextMenuItem } from '@/shared/components/ContextMenu.vue';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';
import { writeClipboardText } from '@/shared/utils/clipboard';
import { formatDate, formatTimestamp } from '@/shared/utils/format';
import { getStatusInfo } from '@/shared/utils/markets';

type BotDetailTab = 'runs' | 'logs' | 'orders';

const DETAIL_PANEL_MIN_HEIGHT = 220;
const DETAIL_PANEL_MAX_HEIGHT = 620;
const DETAIL_PANEL_DEFAULT_HEIGHT = 360;

const { t } = useI18n();

const bots = ref<StrategyBotListItem[]>([]);
const strategies = ref<StrategyListItem[]>([]);
const accounts = ref<PolymarketWalletSummary[]>([]);
const versions = ref<StrategyVersionSummary[]>([]);
const runs = ref<StrategyRunListItem[]>([]);
const logs = ref<StrategyRunLogEntry[]>([]);
const orders = ref<StrategyRunOrderRecord[]>([]);
const selectedBotId = ref('');
const selectedRunId = ref('');
const activeDetailTab = ref<BotDetailTab>('runs');
const detailPanelCollapsed = ref(readDetailPanelCollapsed());
const detailPanelHeight = ref(readDetailPanelHeight());
const loading = ref(false);
const saving = ref(false);
const busyBotId = ref('');
const error = ref('');
const showEditDialog = ref(false);
const deleteTarget = ref<StrategyBotListItem | null>(null);
const botContextMenuOpen = ref(false);
const botContextMenuX = ref(0);
const botContextMenuY = ref(0);
const contextBot = ref<StrategyBotListItem | null>(null);
let unsubscribeRuntime: (() => void) | null = null;
let dragStartY = 0;
let dragStartHeight = DETAIL_PANEL_DEFAULT_HEIGHT;

const form = reactive({
  name: '',
  strategyId: '',
  strategyVersion: '',
  walletId: '',
  config: '{}',
  autoStart: false,
  enabled: true,
  assetId: '',
});

const detailTabs: Array<{ id: BotDetailTab; label: string; icon: typeof History }> = [
  { id: 'runs', label: 'strategy.runs', icon: History },
  { id: 'logs', label: 'bot.logs', icon: ScrollText },
  { id: 'orders', label: 'bot.orders', icon: ReceiptText },
];

const selectedBot = computed(
  () => bots.value.find((item) => item.id === selectedBotId.value) || null,
);
const tradableAccounts = computed(() =>
  accounts.value.filter((account) => account.credentialsConfigured),
);

const botContextMenuItems = computed<ContextMenuItem[]>(() => {
  const botItem = contextBot.value;
  if (!botItem) return [];

  const busy = Boolean(busyBotId.value);
  const canStart = botItem.status !== 'running' && botItem.status !== 'starting';
  const canStop = botItem.status === 'running' || botItem.status === 'starting';
  const runtimeAction: ContextMenuItem = canStop
    ? {
        label: t('bot.stop'),
        icon: Square,
        disabled: busy,
        title: t('bot.stopBot'),
        onSelect: () => stopBot(botItem.id),
      }
    : {
        label: t('bot.start'),
        icon: Play,
        disabled: busy || !canStart || !botItem.enabled,
        title: botItem.enabled ? t('bot.startBot') : t('bot.disabled'),
        onSelect: () => startBot(botItem.id),
      };
  const copyChildren: ContextMenuItem[] = [
    {
      label: t('bot.name'),
      icon: Copy,
      title: botItem.name,
      onSelect: () => copyText(botItem.name, t('bot.name')),
    },
    {
      label: 'Bot ID',
      icon: Copy,
      title: botItem.id,
      onSelect: () => copyText(botItem.id, 'Bot ID'),
    },
    {
      label: 'Market ID',
      icon: Copy,
      title: botItem.marketId,
      onSelect: () => copyText(botItem.marketId, 'Market ID'),
    },
    {
      label: 'Event ID',
      icon: Copy,
      title: botItem.eventId,
      onSelect: () => copyText(botItem.eventId, 'Event ID'),
    },
  ];

  if (botItem.assetId) {
    copyChildren.push({
      label: t('bot.assetId'),
      icon: Copy,
      title: botItem.assetId,
      onSelect: () => copyText(botItem.assetId || '', t('bot.assetId')),
    });
  }

  return [
    {
      label: t('common.edit'),
      icon: Pencil,
      disabled: busy,
      onSelect: () => openEditDialog(botItem),
    },
    runtimeAction,
    {
      label: t('common.copy'),
      icon: Copy,
      children: copyChildren,
    },
    { separator: true },
    {
      label: t('common.delete'),
      icon: Trash2,
      danger: true,
      disabled: busy,
      onSelect: () => requestDeleteBot(botItem),
    },
  ];
});

function detailPanelStorageKey(): string {
  return 'main-window:bots:detail-panel-height';
}

function detailPanelCollapsedStorageKey(): string {
  return 'main-window:bots:detail-panel-collapsed';
}

function readDetailPanelCollapsed(): boolean {
  return window.localStorage.getItem(detailPanelCollapsedStorageKey()) === '1';
}

function writeDetailPanelCollapsed(value: boolean): void {
  window.localStorage.setItem(detailPanelCollapsedStorageKey(), value ? '1' : '0');
}

function clampDetailPanelHeight(value: number): number {
  return Math.min(DETAIL_PANEL_MAX_HEIGHT, Math.max(DETAIL_PANEL_MIN_HEIGHT, Math.round(value)));
}

function readDetailPanelHeight(): number {
  const value = Number(window.localStorage.getItem(detailPanelStorageKey()));
  if (!Number.isFinite(value)) return DETAIL_PANEL_DEFAULT_HEIGHT;
  return clampDetailPanelHeight(value);
}

function writeDetailPanelHeight(value: number): void {
  window.localStorage.setItem(detailPanelStorageKey(), String(value));
}

function startResize(event: MouseEvent): void {
  if (detailPanelCollapsed.value) return;
  dragStartY = event.clientY;
  dragStartHeight = detailPanelHeight.value;
  document.body.style.cursor = 'row-resize';
  document.body.style.userSelect = 'none';
  window.addEventListener('mousemove', resizePanel);
  window.addEventListener('mouseup', stopResize);
}

function toggleDetailPanelCollapsed(): void {
  detailPanelCollapsed.value = !detailPanelCollapsed.value;
}

function resizePanel(event: MouseEvent): void {
  detailPanelHeight.value = clampDetailPanelHeight(dragStartHeight + dragStartY - event.clientY);
}

function stopResize(): void {
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  window.removeEventListener('mousemove', resizePanel);
  window.removeEventListener('mouseup', stopResize);
}

function statusClass(status: string): string {
  if (status === 'running') return 'text-emerald-400';
  if (status === 'starting' || status === 'stopping') return 'text-amber-400';
  if (status === 'error') return 'text-red-400';
  return 'text-muted-light';
}

function eventStatusInfo(item: StrategyBotListItem): { label: string; class: string } {
  return getStatusInfo({
    active: item.eventActive === true,
    closed: item.eventClosed === true,
  });
}

function detailTabCount(tab: BotDetailTab): number {
  if (tab === 'runs') return runs.value.length;
  if (tab === 'logs') return logs.value.length;
  return orders.value.length;
}

function fillForm(botItem: StrategyBotListItem): void {
  form.name = botItem.name;
  form.strategyId = botItem.strategyId;
  form.strategyVersion = String(botItem.strategyVersion);
  form.walletId = botItem.walletId;
  form.config = botItem.config || '{}';
  form.autoStart = botItem.autoStart;
  form.enabled = botItem.enabled;
  form.assetId = botItem.assetId || '';
}

async function loadVersions(): Promise<void> {
  versions.value = [];
  if (!form.strategyId) return;
  const res = await window.api.listStrategyVersions(form.strategyId);
  versions.value = res.ok ? res.data : [];
}

async function loadRunDetails(runId: string): Promise<void> {
  const [logRes, orderRes] = await Promise.all([
    window.api.getBotLogs(runId, 200),
    window.api.getBotOrders(runId, 200),
  ]);
  logs.value = logRes.ok ? logRes.data : [];
  orders.value = orderRes.ok ? orderRes.data : [];
}

async function loadRuns(botId: string): Promise<void> {
  const res = await window.api.listBotRuns(botId, 100);
  runs.value = res.ok ? res.data : [];
  if (!runs.value.some((run) => run.id === selectedRunId.value)) {
    selectedRunId.value = runs.value[0]?.id || '';
  }
  if (selectedRunId.value) await loadRunDetails(selectedRunId.value);
  else {
    logs.value = [];
    orders.value = [];
  }
}

async function selectBot(id: string): Promise<void> {
  selectedBotId.value = id;
  const botItem = selectedBot.value;
  if (!botItem) return;
  fillForm(botItem);
  await Promise.all([loadVersions(), loadRuns(id)]);
}

async function refresh(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const [botRes, strategyRes, accountRes] = await Promise.all([
      window.api.listBots({ limit: 500 }),
      window.api.listStrategies(),
      window.api.wallet.list(),
    ]);
    if (!botRes.ok) throw new Error(botRes.error);
    bots.value = botRes.data;
    strategies.value = strategyRes.ok ? strategyRes.data : [];
    accounts.value = accountRes.ok ? accountRes.data : [];
    if (!bots.value.some((item) => item.id === selectedBotId.value)) {
      selectedBotId.value = bots.value[0]?.id || '';
    }
    if (selectedBotId.value) await selectBot(selectedBotId.value);
    else {
      runs.value = [];
      logs.value = [];
      orders.value = [];
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

async function saveBot(): Promise<void> {
  if (!selectedBot.value) return;
  saving.value = true;
  error.value = '';
  try {
    const res = await window.api.updateBot({
      id: selectedBot.value.id,
      name: form.name,
      strategyId: form.strategyId,
      strategyVersion: form.strategyVersion ? Number(form.strategyVersion) : null,
      walletId: form.walletId,
      config: form.config,
      autoStart: form.autoStart,
      enabled: form.enabled,
      assetId: form.assetId,
    });
    if (!res.ok) throw new Error(res.error);
    await refresh();
    await selectBot(res.data.id);
    showEditDialog.value = false;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    saving.value = false;
  }
}

async function openEditDialog(item: StrategyBotListItem): Promise<void> {
  await selectBot(item.id);
  showEditDialog.value = true;
}

function closeEditDialog(): void {
  if (saving.value) return;
  showEditDialog.value = false;
}

async function startBot(id: string): Promise<void> {
  busyBotId.value = id;
  error.value = '';
  try {
    const res = await window.api.startBot(id);
    if (!res.ok) throw new Error(res.error);
    await refresh();
    await selectBot(id);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    busyBotId.value = '';
  }
}

async function stopBot(id: string): Promise<void> {
  busyBotId.value = id;
  error.value = '';
  try {
    const res = await window.api.stopBot(id);
    if (!res.ok) throw new Error(res.error);
    await refresh();
    await selectBot(id);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    busyBotId.value = '';
  }
}

async function copyText(text: string, label: string): Promise<void> {
  const value = text.trim();
  if (!value) {
    error.value = t('strategy.emptyValue', { label });
    return;
  }

  error.value = '';
  try {
    await writeClipboardText(value);
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('strategy.copyFailed');
  }
}

function openBotContextMenu(event: MouseEvent, botItem: StrategyBotListItem): void {
  contextBot.value = botItem;
  botContextMenuX.value = event.clientX;
  botContextMenuY.value = event.clientY;
  botContextMenuOpen.value = true;
  void selectBot(botItem.id);
}

function requestDeleteBot(botItem: StrategyBotListItem): void {
  deleteTarget.value = botItem;
}

function closeDeleteDialog(): void {
  if (busyBotId.value) return;
  deleteTarget.value = null;
}

async function confirmDeleteBot(): Promise<void> {
  if (!deleteTarget.value) return;
  const id = deleteTarget.value.id;
  busyBotId.value = id;
  error.value = '';
  try {
    const res = await window.api.deleteBot(id);
    if (!res.ok) throw new Error(res.error);
    deleteTarget.value = null;
    if (selectedBotId.value === id) {
      selectedBotId.value = '';
      selectedRunId.value = '';
    }
    await refresh();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    busyBotId.value = '';
  }
}

function selectRun(runId: string): void {
  selectedRunId.value = runId;
  void loadRunDetails(runId);
}

watch(
  () => form.strategyId,
  () => {
    void loadVersions();
  },
);

watch(detailPanelHeight, (next) => writeDetailPanelHeight(next));

watch(detailPanelCollapsed, (next) => writeDetailPanelCollapsed(next));

onMounted(async () => {
  unsubscribeRuntime = window.api.onBotRuntimeEvent((event) => {
    if (event.type === 'bots:changed' || event.type === 'bot:status') {
      void refresh();
    } else if ('runId' in event && selectedRunId.value === event.runId) {
      void loadRunDetails(event.runId);
    }
  });
  await refresh();
});

onUnmounted(() => {
  stopResize();
  unsubscribeRuntime?.();
});
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div
      class="border-border bg-surface flex shrink-0 items-center justify-between border-b px-6 py-4"
    >
      <div>
        <h1 class="text-lg font-semibold text-white">{{ t('bot.management') }}</h1>
        <p v-if="error" class="mt-1 text-sm text-red-400">{{ error }}</p>
        <p v-else class="text-muted mt-1 text-sm">{{ t('count.items', { count: bots.length }) }}</p>
      </div>
    </div>

    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <section class="min-h-0 flex-1 overflow-auto">
        <table v-if="bots.length" class="w-full border-collapse">
          <thead class="bg-surface sticky top-0 z-10">
            <tr>
              <th
                class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
              >
                {{ t('common.name') }}
              </th>
              <th
                class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
              >
                Event
              </th>
              <th
                class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
              >
                {{ t('common.market') }}
              </th>
              <th
                class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
              >
                {{ t('common.strategy') }}
              </th>
              <th
                class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
              >
                {{ t('common.account') }}
              </th>
              <th
                class="border-border text-muted border-b px-4 py-2.5 text-center text-xs font-semibold uppercase"
              >
                {{ t('common.status') }}
              </th>
              <th
                class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
              >
                {{ t('bot.recentRun') }}
              </th>
              <th
                class="border-border text-muted w-[96px] border-b px-4 py-2.5 text-center text-xs font-semibold uppercase"
              >
                {{ t('common.actions') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in bots"
              :key="item.id"
              class="border-border/60 cursor-pointer border-b hover:bg-[#1a1a2e]"
              :class="selectedBotId === item.id ? 'bg-primary/10' : ''"
              @click="selectBot(item.id)"
              @contextmenu.prevent="openBotContextMenu($event, item)"
            >
              <td class="px-4 py-3">
                <div class="text-sm font-medium text-white">{{ item.name }}</div>
                <div
                  v-if="item.runtimeError"
                  class="mt-1 max-w-[320px] truncate text-xs text-red-400"
                >
                  {{ item.runtimeError }}
                </div>
              </td>
              <td class="max-w-[360px] px-4 py-3">
                <div class="flex min-w-0 items-center gap-3">
                  <img
                    v-if="item.eventImage"
                    :src="item.eventImage"
                    alt=""
                    loading="lazy"
                    class="h-8 w-8 shrink-0 rounded-md object-cover"
                  />
                  <div class="min-w-0">
                    <div class="truncate text-sm font-semibold text-white" :title="item.eventTitle">
                      {{ item.eventTitle }}
                    </div>
                    <div class="mt-1 flex min-w-0 items-center gap-2 text-xs">
                      <span
                        class="shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase"
                        :class="eventStatusInfo(item).class"
                      >
                        {{ eventStatusInfo(item).label }}
                      </span>
                      <span class="text-muted-light truncate">
                        {{ t('market.endAt', { date: formatDate(item.eventEndDate) }) }}
                      </span>
                    </div>
                  </div>
                </div>
              </td>
              <td class="text-muted max-w-[320px] px-4 py-3 text-xs">
                <div class="flex min-w-0 items-center gap-3">
                  <img
                    v-if="item.marketIcon"
                    :src="item.marketIcon"
                    alt=""
                    loading="lazy"
                    class="h-8 w-8 shrink-0 rounded-md object-cover"
                  />
                  <div class="min-w-0">
                    <div class="text-text truncate text-sm" :title="item.marketTitle">
                      {{ item.marketTitle }}
                    </div>
                    <div class="mt-1 truncate font-mono">market id: {{ item.marketId }}</div>
                  </div>
                </div>
              </td>
              <td class="text-muted px-4 py-3 text-sm">
                {{ item.strategyName }} v{{ item.strategyVersion }}
              </td>
              <td class="text-muted px-4 py-3 text-sm">{{ item.walletName }}</td>
              <td class="px-4 py-3 text-center">
                <span class="rounded px-2 py-1 text-xs" :class="statusClass(item.status)">
                  {{ item.status }}
                </span>
              </td>
              <td class="text-muted px-4 py-3 text-xs">
                {{
                  item.lastRun ? formatTimestamp(item.lastRun.startedAt) : t('strategy.emptyRuns')
                }}
              </td>
              <td class="px-4 py-3 text-center">
                <div class="flex items-center justify-center gap-2" @click.stop>
                  <button
                    v-if="item.status !== 'running' && item.status !== 'starting'"
                    type="button"
                    class="bg-primary hover:bg-primary-hover inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                    :disabled="!!busyBotId || !item.enabled"
                    @click="startBot(item.id)"
                  >
                    <LoadingSpinner
                      v-if="busyBotId === item.id"
                      :size="13"
                      :title="t('bot.startBot')"
                    />
                    <Play v-else :size="13" />
                    {{ t('bot.start') }}
                  </button>
                  <button
                    v-else
                    type="button"
                    class="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 px-2.5 py-1.5 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/10 disabled:opacity-50"
                    :disabled="!!busyBotId"
                    @click="stopBot(item.id)"
                  >
                    <LoadingSpinner
                      v-if="busyBotId === item.id"
                      :size="13"
                      :title="t('bot.stopBot')"
                    />
                    <Square v-else :size="13" />
                    {{ t('bot.stop') }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div
          v-else
          class="text-muted flex h-full flex-col items-center justify-center gap-3 p-8 text-sm"
        >
          <Bot :size="24" />
          <span>{{ t('bot.empty') }}</span>
        </div>
      </section>

      <section
        class="border-border bg-detail-bg flex shrink-0 flex-col overflow-hidden border-t"
        :style="detailPanelCollapsed ? undefined : { height: `${detailPanelHeight}px` }"
      >
        <div
          v-if="!detailPanelCollapsed"
          class="group h-1.5 shrink-0 cursor-row-resize"
          :title="t('account.resizeDetailPanel')"
          @mousedown="startResize"
        >
          <div class="group-hover:bg-primary/70 mx-auto h-0.5 w-16 rounded-full bg-transparent" />
        </div>

        <div
          class="border-border flex shrink-0 items-center justify-between gap-2 border-b px-2 py-2"
        >
          <div class="flex min-w-0 items-center gap-1 overflow-x-auto">
            <button
              v-for="tab in detailTabs"
              :key="tab.id"
              type="button"
              class="inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm transition-colors"
              :class="
                activeDetailTab === tab.id
                  ? 'bg-btn-secondary-hover text-white'
                  : 'text-muted-light hover:bg-btn-secondary hover:text-text'
              "
              @click="activeDetailTab = tab.id"
            >
              <component :is="tab.icon" :size="14" />
              <span>{{ t(tab.label) }}</span>
              <span
                class="inline-flex min-h-4 min-w-4 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] leading-none"
                :class="
                  activeDetailTab === tab.id
                    ? 'bg-primary/30 text-primary-light'
                    : 'bg-bg text-muted'
                "
              >
                {{ detailTabCount(tab.id) }}
              </span>
            </button>
          </div>

          <button
            type="button"
            class="hover:bg-btn-secondary text-muted-light inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:text-white"
            :title="
              detailPanelCollapsed
                ? t('account.expandDetailPanel')
                : t('account.collapseDetailPanel')
            "
            @click="toggleDetailPanelCollapsed"
          >
            <PanelBottomOpen v-if="detailPanelCollapsed" :size="16" />
            <PanelBottomClose v-else :size="16" />
          </button>
        </div>

        <div
          v-if="!detailPanelCollapsed && !selectedBot"
          class="text-muted flex flex-1 items-center justify-center text-sm"
        >
          {{ t('bot.emptyHint') }}
        </div>

        <div
          v-else-if="!detailPanelCollapsed && activeDetailTab === 'runs'"
          class="min-h-0 flex-1 overflow-auto"
        >
          <table v-if="runs.length" class="w-full border-collapse">
            <thead class="bg-surface sticky top-0 z-10">
              <tr>
                <th
                  class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
                >
                  {{ t('common.version') }}
                </th>
                <th
                  class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
                >
                  {{ t('common.status') }}
                </th>
                <th
                  class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
                >
                  {{ t('common.startedAt') }}
                </th>
                <th
                  class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
                >
                  {{ t('common.endedAt') }}
                </th>
                <th
                  class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
                >
                  {{ t('error.title') }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="run in runs"
                :key="run.id"
                class="border-border/60 cursor-pointer border-b hover:bg-[#1a1a2e]"
                :class="selectedRunId === run.id ? 'bg-primary/10' : ''"
                @click="selectRun(run.id)"
              >
                <td class="px-4 py-3 text-sm text-white">v{{ run.strategyVersion }}</td>
                <td class="px-4 py-3 text-sm" :class="statusClass(run.status)">{{ run.status }}</td>
                <td class="text-muted px-4 py-3 text-xs">{{ formatTimestamp(run.startedAt) }}</td>
                <td class="text-muted px-4 py-3 text-xs">
                  {{ run.stoppedAt ? formatTimestamp(run.stoppedAt) : '—' }}
                </td>
                <td class="max-w-[520px] truncate px-4 py-3 text-xs text-red-400">
                  {{ run.runtimeError || '—' }}
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else class="text-muted flex h-full items-center justify-center text-sm">
            {{ t('strategy.emptyRuns') }}
          </div>
        </div>

        <div
          v-else-if="!detailPanelCollapsed && activeDetailTab === 'logs'"
          class="min-h-0 flex-1 overflow-auto"
        >
          <table v-if="logs.length" class="w-full border-collapse">
            <thead class="bg-surface sticky top-0 z-10">
              <tr>
                <th
                  class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
                >
                  Level
                </th>
                <th
                  class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
                >
                  Module
                </th>
                <th
                  class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
                >
                  Message
                </th>
                <th
                  class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
                >
                  Time
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="log in logs" :key="log.id" class="border-border/60 border-b">
                <td class="px-4 py-2.5 text-xs" :class="statusClass(log.level)">{{ log.level }}</td>
                <td class="text-muted px-4 py-2.5 text-xs">{{ log.module }}</td>
                <td
                  class="text-muted-light max-w-[780px] truncate px-4 py-2.5 text-xs"
                  :title="log.message"
                >
                  {{ log.message }}
                </td>
                <td class="text-muted px-4 py-2.5 text-xs">{{ formatTimestamp(log.time) }}</td>
              </tr>
            </tbody>
          </table>
          <div v-else class="text-muted flex h-full items-center justify-center text-sm">
            {{ t('bot.emptyLogs') }}
          </div>
        </div>

        <div v-else-if="!detailPanelCollapsed" class="min-h-0 flex-1 overflow-auto">
          <table v-if="orders.length" class="w-full border-collapse">
            <thead class="bg-surface sticky top-0 z-10">
              <tr>
                <th
                  class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
                >
                  {{ t('common.status') }}
                </th>
                <th
                  class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
                >
                  Order ID
                </th>
                <th
                  class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
                >
                  {{ t('error.title') }}
                </th>
                <th
                  class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
                >
                  Time
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="order in orders" :key="order.id" class="border-border/60 border-b">
                <td
                  class="px-4 py-2.5 text-xs"
                  :class="order.success ? 'text-emerald-400' : 'text-red-400'"
                >
                  {{ order.success ? 'success' : 'failed' }}
                </td>
                <td class="text-muted px-4 py-2.5 font-mono text-xs">
                  {{ order.exchangeOrderId || '—' }}
                </td>
                <td class="max-w-[560px] truncate px-4 py-2.5 text-xs text-red-400">
                  {{ order.errorMessage || '—' }}
                </td>
                <td class="text-muted px-4 py-2.5 text-xs">
                  {{ formatTimestamp(order.submittedAt) }}
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else class="text-muted flex h-full items-center justify-center text-sm">
            {{ t('order.noOrders') }}
          </div>
        </div>
      </section>
    </div>

    <ContextMenu
      v-model:open="botContextMenuOpen"
      :x="botContextMenuX"
      :y="botContextMenuY"
      :items="botContextMenuItems"
      @close="contextBot = null"
    />

    <Transition name="bot-dialog">
      <div
        v-if="deleteTarget"
        class="app-no-drag fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4"
        @click.self="closeDeleteDialog"
      >
        <div
          class="border-border bg-surface w-full max-w-md overflow-hidden rounded-lg border shadow-2xl"
        >
          <div class="border-border border-b px-5 py-4">
            <h2 class="text-base font-semibold text-white">{{ t('bot.delete') }}</h2>
            <p class="text-muted mt-2 text-sm">{{ t('bot.deleteDescription') }}</p>
            <p class="mt-3 truncate text-sm text-white" :title="deleteTarget.name">
              {{ deleteTarget.name }}
            </p>
          </div>
          <div class="border-border flex justify-end gap-2 border-t px-5 py-4">
            <button
              type="button"
              class="border-border text-text inline-flex items-center justify-center rounded-md border bg-[#1e1e35] px-4 py-2 text-sm transition-colors hover:bg-[#2a2a45] disabled:opacity-50"
              :disabled="!!busyBotId"
              @click="closeDeleteDialog"
            >
              {{ t('common.cancel') }}
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-md border border-red-500/40 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-50"
              :disabled="!!busyBotId"
              @click="confirmDeleteBot"
            >
              <LoadingSpinner v-if="busyBotId" :size="14" :title="t('bot.delete')" />
              <Trash2 v-else :size="14" />
              {{ t('common.delete') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="bot-dialog">
      <div
        v-if="showEditDialog && selectedBot"
        class="app-no-drag fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4"
        @click.self="closeEditDialog"
      >
        <form
          class="border-border bg-surface flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border shadow-2xl"
          @submit.prevent="saveBot"
        >
          <div
            class="border-border flex shrink-0 items-center justify-between gap-3 border-b px-5 py-4"
          >
            <div class="min-w-0">
              <h2 class="truncate text-base font-semibold text-white">{{ t('bot.edit') }}</h2>
              <p class="text-muted mt-1 truncate text-xs">{{ selectedBot.marketTitle }}</p>
            </div>
            <button
              type="button"
              class="hover:bg-btn-secondary text-muted-light inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:text-white"
              :title="t('common.close')"
              :disabled="saving"
              @click="closeEditDialog"
            >
              <X :size="16" />
            </button>
          </div>

          <div class="min-h-0 flex-1 overflow-auto p-5">
            <div class="grid grid-cols-2 gap-4">
              <label class="block">
                <span class="text-muted text-xs">{{ t('common.name') }}</span>
                <input
                  v-model="form.name"
                  class="border-border bg-bg text-text mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none"
                />
              </label>
              <label class="block">
                <span class="text-muted text-xs">{{ t('bot.assetId') }}</span>
                <input
                  v-model="form.assetId"
                  class="border-border bg-bg text-text mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none"
                />
              </label>
              <label class="block">
                <span class="text-muted text-xs">{{ t('common.strategy') }}</span>
                <select
                  v-model="form.strategyId"
                  class="border-border bg-bg text-text mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none"
                >
                  <option v-for="strategy in strategies" :key="strategy.id" :value="strategy.id">
                    {{ strategy.name }} v{{ strategy.currentVersion }}
                  </option>
                </select>
              </label>
              <label class="block">
                <span class="text-muted text-xs">{{ t('common.version') }}</span>
                <select
                  v-model="form.strategyVersion"
                  class="border-border bg-bg text-text mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none"
                >
                  <option
                    v-for="version in versions"
                    :key="version.id"
                    :value="String(version.version)"
                  >
                    v{{ version.version }} · {{ version.compileStatus }}
                  </option>
                </select>
              </label>
              <label class="block">
                <span class="text-muted text-xs">{{ t('common.account') }}</span>
                <select
                  v-model="form.walletId"
                  class="border-border bg-bg text-text mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none"
                >
                  <option v-for="account in tradableAccounts" :key="account.id" :value="account.id">
                    {{ account.name }}{{ account.isDefault ? ` · ${t('account.default')}` : '' }}
                  </option>
                </select>
              </label>
              <div class="grid grid-cols-2 gap-3 pt-6">
                <label class="text-muted-light inline-flex items-center gap-2 text-sm">
                  <input v-model="form.autoStart" type="checkbox" class="accent-primary" />
                  {{ t('bot.autoStart') }}
                </label>
                <label class="text-muted-light inline-flex items-center gap-2 text-sm">
                  <input v-model="form.enabled" type="checkbox" class="accent-primary" />
                  {{ t('bot.enabled') }}
                </label>
              </div>
            </div>

            <label class="mt-4 block">
              <span class="text-muted text-xs">{{ t('bot.configJson') }}</span>
              <textarea
                v-model="form.config"
                spellcheck="false"
                class="border-border bg-bg text-text mt-1 h-32 w-full resize-none rounded-md border px-3 py-2 font-mono text-xs outline-none"
              />
            </label>
          </div>

          <div class="border-border flex shrink-0 justify-end gap-2 border-t px-5 py-4">
            <button
              type="button"
              class="border-border text-text inline-flex items-center justify-center rounded-md border bg-[#1e1e35] px-4 py-2 text-sm transition-colors hover:bg-[#2a2a45] disabled:opacity-50"
              :disabled="saving"
              @click="closeEditDialog"
            >
              {{ t('common.cancel') }}
            </button>
            <button
              type="submit"
              class="bg-primary hover:bg-primary-hover inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              :disabled="
                saving || !form.name || !form.assetId || !form.strategyId || !form.walletId
              "
            >
              <LoadingSpinner v-if="saving" :size="14" :title="t('bot.save')" />
              <Save v-else :size="14" />
              {{ t('common.save') }}
            </button>
          </div>
        </form>
      </div>
    </Transition>
  </div>
</template>
