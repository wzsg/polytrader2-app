<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  CheckCircle2,
  Code2,
  Copy,
  FilePlus2,
  History,
  PanelBottomClose,
  PanelBottomOpen,
  Pencil,
  Trash2,
  XCircle,
} from '@lucide/vue';
import type {
  StrategyListItem,
  StrategyRunListItem,
  StrategyVersionSummary,
} from '@polytrader/shared';
import ContextMenu, { type ContextMenuItem } from '@/shared/components/ContextMenu.vue';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';
import { writeClipboardText } from '@/shared/utils/clipboard';
import { formatTimestamp } from '@/shared/utils/format';

type StrategyDetailTab = 'versions' | 'runs';

const DETAIL_PANEL_MIN_HEIGHT = 220;
const DETAIL_PANEL_MAX_HEIGHT = 620;
const DETAIL_PANEL_DEFAULT_HEIGHT = 360;

const { t } = useI18n();

const strategies = ref<StrategyListItem[]>([]);
const versions = ref<StrategyVersionSummary[]>([]);
const runs = ref<StrategyRunListItem[]>([]);
const selectedStrategyId = ref('');
const activeDetailTab = ref<StrategyDetailTab>('versions');
const detailPanelCollapsed = ref(readDetailPanelCollapsed());
const detailPanelHeight = ref(readDetailPanelHeight());
const loading = ref(false);
const busyStrategyId = ref('');
const error = ref('');
const deleteTarget = ref<StrategyListItem | null>(null);
const strategyContextMenuOpen = ref(false);
const strategyContextMenuX = ref(0);
const strategyContextMenuY = ref(0);
const contextStrategy = ref<StrategyListItem | null>(null);
let unsubscribeStrategiesChanged: (() => void) | null = null;
let dragStartY = 0;
let dragStartHeight = DETAIL_PANEL_DEFAULT_HEIGHT;

const detailTabs: Array<{ id: StrategyDetailTab; label: string; icon: typeof History }> = [
  { id: 'versions', label: 'strategy.versions', icon: Code2 },
  { id: 'runs', label: 'strategy.runs', icon: History },
];

const selectedStrategy = computed(
  () => strategies.value.find((item) => item.id === selectedStrategyId.value) || null,
);

const strategyContextMenuItems = computed<ContextMenuItem[]>(() => {
  const strategy = contextStrategy.value;
  if (!strategy) return [];

  const busy = Boolean(busyStrategyId.value);
  return [
    {
      label: t('common.edit'),
      icon: Pencil,
      disabled: busy,
      onSelect: () => openEditStrategy(strategy),
    },
    {
      label: t('common.copy'),
      icon: Copy,
      children: [
        {
          label: t('strategy.name'),
          icon: Copy,
          title: strategy.name,
          onSelect: () => copyText(strategy.name, t('strategy.name')),
        },
        {
          label: 'Strategy ID',
          icon: Copy,
          title: strategy.id,
          onSelect: () => copyText(strategy.id, 'Strategy ID'),
        },
      ],
    },
    { separator: true },
    {
      label: t('common.delete'),
      icon: Trash2,
      danger: true,
      disabled: busy,
      onSelect: () => requestDelete(strategy),
    },
  ];
});

function detailPanelStorageKey(): string {
  return 'main-window:strategies:detail-panel-height';
}

function detailPanelCollapsedStorageKey(): string {
  return 'main-window:strategies:detail-panel-collapsed';
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

function resizePanel(event: MouseEvent): void {
  detailPanelHeight.value = clampDetailPanelHeight(dragStartHeight + dragStartY - event.clientY);
}

function stopResize(): void {
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  window.removeEventListener('mousemove', resizePanel);
  window.removeEventListener('mouseup', stopResize);
}

function toggleDetailPanelCollapsed(): void {
  detailPanelCollapsed.value = !detailPanelCollapsed.value;
}

function statusClass(status: string): string {
  if (status === 'success' || status === 'running') return 'text-emerald-400';
  if (status === 'failed' || status === 'error') return 'text-red-400';
  if (status === 'starting' || status === 'stopping' || status === 'pending') {
    return 'text-amber-400';
  }
  return 'text-muted-light';
}

function detailTabCount(tab: StrategyDetailTab): number {
  return tab === 'versions' ? versions.value.length : runs.value.length;
}

async function loadVersions(strategyId: string): Promise<void> {
  const res = await window.api.listStrategyVersions(strategyId);
  versions.value = res.ok ? res.data : [];
}

async function loadRuns(strategyId: string): Promise<void> {
  const res = await window.api.listStrategyRunHistory({ strategyId, limit: 100 });
  runs.value = res.ok ? res.data : [];
}

async function selectStrategy(id: string): Promise<void> {
  selectedStrategyId.value = id;
  if (!id) {
    versions.value = [];
    runs.value = [];
    return;
  }
  await Promise.all([loadVersions(id), loadRuns(id)]);
}

async function refresh(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const res = await window.api.listStrategies();
    if (!res.ok) throw new Error(res.error);
    strategies.value = res.data;
    if (!strategies.value.some((item) => item.id === selectedStrategyId.value)) {
      selectedStrategyId.value = strategies.value[0]?.id || '';
    }
    await selectStrategy(selectedStrategyId.value);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

function openNewStrategy(): void {
  void window.api.openStrategyEditor({ mode: 'new' });
}

function openEditStrategy(strategy: StrategyListItem): void {
  void window.api.openStrategyEditor({ mode: 'edit', strategyId: strategy.id });
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

function openStrategyContextMenu(event: MouseEvent, strategy: StrategyListItem): void {
  contextStrategy.value = strategy;
  strategyContextMenuX.value = event.clientX;
  strategyContextMenuY.value = event.clientY;
  strategyContextMenuOpen.value = true;
  void selectStrategy(strategy.id);
}

function requestDelete(strategy: StrategyListItem): void {
  deleteTarget.value = strategy;
}

function closeDeleteDialog(): void {
  if (busyStrategyId.value) return;
  deleteTarget.value = null;
}

async function confirmDelete(): Promise<void> {
  if (!deleteTarget.value) return;
  const strategyId = deleteTarget.value.id;
  busyStrategyId.value = strategyId;
  error.value = '';
  try {
    const res = await window.api.deleteStrategy(strategyId);
    if (!res.ok) throw new Error(res.error);
    deleteTarget.value = null;
    if (selectedStrategyId.value === strategyId) selectedStrategyId.value = '';
    await refresh();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    busyStrategyId.value = '';
  }
}

watch(detailPanelHeight, (next) => writeDetailPanelHeight(next));

watch(detailPanelCollapsed, (next) => writeDetailPanelCollapsed(next));

onMounted(async () => {
  unsubscribeStrategiesChanged = window.api.onStrategiesChanged(() => {
    void refresh();
  });
  await refresh();
});

onUnmounted(() => {
  stopResize();
  unsubscribeStrategiesChanged?.();
});
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div
      class="border-border bg-surface flex shrink-0 items-center justify-between border-b px-6 py-4"
    >
      <div>
        <h1 class="text-lg font-semibold text-white">{{ t('strategy.management') }}</h1>
        <p v-if="error" class="mt-1 text-sm text-red-400">{{ error }}</p>
        <p v-else class="text-muted mt-1 text-sm">
          {{ t('count.items', { count: strategies.length }) }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="border-border text-text inline-flex items-center gap-2 rounded-md border bg-[#1e1e35] px-3 py-2 text-sm transition-colors hover:bg-[#2a2a45]"
          @click="openNewStrategy"
        >
          <FilePlus2 :size="14" />
          {{ t('common.create') }}
        </button>
      </div>
    </div>

    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <section class="min-h-0 flex-1 overflow-auto">
        <table v-if="strategies.length" class="w-full border-collapse">
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
                {{ t('strategy.currentVersion') }}
              </th>
              <th
                class="border-border text-muted border-b px-4 py-2.5 text-center text-xs font-semibold uppercase"
              >
                {{ t('strategy.compileStatus') }}
              </th>
              <th
                class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
              >
                {{ t('common.updatedAt') }}
              </th>
              <th
                class="border-border text-muted w-[150px] border-b px-4 py-2.5 text-center text-xs font-semibold uppercase"
              >
                {{ t('common.actions') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="strategy in strategies"
              :key="strategy.id"
              class="border-border/60 cursor-pointer border-b hover:bg-[#1a1a2e]"
              :class="selectedStrategyId === strategy.id ? 'bg-primary/10' : ''"
              @click="selectStrategy(strategy.id)"
              @contextmenu.prevent="openStrategyContextMenu($event, strategy)"
            >
              <td class="px-4 py-3">
                <div class="text-sm font-medium text-white">{{ strategy.name }}</div>
                <div
                  v-if="strategy.compileError"
                  class="mt-1 max-w-[520px] truncate text-xs text-red-400"
                  :title="strategy.compileError"
                >
                  {{ strategy.compileError }}
                </div>
              </td>
              <td class="text-muted px-4 py-3 text-sm">v{{ strategy.currentVersion }}</td>
              <td class="px-4 py-3 text-center">
                <span
                  class="inline-flex items-center gap-1 rounded px-2 py-1 text-xs"
                  :class="statusClass(strategy.compileStatus)"
                >
                  <CheckCircle2 v-if="strategy.compileStatus === 'success'" :size="12" />
                  <XCircle v-else-if="strategy.compileStatus === 'failed'" :size="12" />
                  {{ strategy.compileStatus }}
                </span>
              </td>
              <td class="text-muted px-4 py-3 text-xs">
                {{ formatTimestamp(strategy.updatedAt) }}
              </td>
              <td class="px-4 py-3 text-center">
                <div class="flex items-center justify-center gap-2" @click.stop>
                  <button
                    type="button"
                    class="border-border text-muted hover:text-text inline-flex items-center justify-center rounded border px-2 py-1.5 transition-colors hover:bg-[#23233a] disabled:opacity-50"
                    :title="t('strategy.editor')"
                    :disabled="!!busyStrategyId"
                    @click="openEditStrategy(strategy)"
                  >
                    <Pencil :size="13" />
                  </button>
                  <button
                    type="button"
                    class="border-border text-muted inline-flex items-center justify-center rounded border px-2 py-1.5 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                    :title="t('strategy.deleteStrategy')"
                    :disabled="!!busyStrategyId"
                    @click="requestDelete(strategy)"
                  >
                    <LoadingSpinner
                      v-if="busyStrategyId === strategy.id"
                      :size="13"
                      :title="t('strategy.deleteStrategy')"
                    />
                    <Trash2 v-else :size="13" />
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
          <Code2 :size="24" />
          <span>{{ t('strategy.empty') }}</span>
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
          v-if="!detailPanelCollapsed && !selectedStrategy"
          class="text-muted flex flex-1 items-center justify-center text-sm"
        >
          {{ t('strategy.selectHint') }}
        </div>

        <div
          v-else-if="!detailPanelCollapsed && activeDetailTab === 'versions'"
          class="min-h-0 flex-1 overflow-auto"
        >
          <table v-if="versions.length" class="w-full border-collapse">
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
                  {{ t('strategy.compileStatus') }}
                </th>
                <th
                  class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
                >
                  {{ t('common.createdAt') }}
                </th>
                <th
                  class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
                >
                  {{ t('strategy.compileError') }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="version in versions" :key="version.id" class="border-border/60 border-b">
                <td class="px-4 py-3 text-sm text-white">v{{ version.version }}</td>
                <td class="px-4 py-3 text-sm" :class="statusClass(version.compileStatus)">
                  {{ version.compileStatus }}
                </td>
                <td class="text-muted px-4 py-3 text-xs">
                  {{ formatTimestamp(version.createdAt) }}
                </td>
                <td
                  class="max-w-[720px] truncate px-4 py-3 text-xs text-red-400"
                  :title="version.compileError || ''"
                >
                  {{ version.compileError || '—' }}
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else class="text-muted flex h-full items-center justify-center text-sm">
            {{ t('strategy.emptyVersions') }}
          </div>
        </div>

        <div v-else-if="!detailPanelCollapsed" class="min-h-0 flex-1 overflow-auto">
          <table v-if="runs.length" class="w-full border-collapse">
            <thead class="bg-surface sticky top-0 z-10">
              <tr>
                <th
                  class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
                >
                  {{ t('common.market') }}
                </th>
                <th
                  class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
                >
                  {{ t('common.account') }}
                </th>
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
              <tr v-for="run in runs" :key="run.id" class="border-border/60 border-b">
                <td class="max-w-[380px] px-4 py-3">
                  <div class="truncate text-sm text-white" :title="run.marketTitle">
                    {{ run.marketTitle }}
                  </div>
                  <div class="text-muted mt-1 truncate font-mono text-xs">
                    market id: {{ run.marketId }}
                  </div>
                </td>
                <td class="text-muted px-4 py-3 text-sm">{{ run.walletName }}</td>
                <td class="px-4 py-3 text-sm text-white">v{{ run.strategyVersion }}</td>
                <td class="px-4 py-3 text-sm" :class="statusClass(run.status)">{{ run.status }}</td>
                <td class="text-muted px-4 py-3 text-xs">{{ formatTimestamp(run.startedAt) }}</td>
                <td class="text-muted px-4 py-3 text-xs">
                  {{ run.stoppedAt ? formatTimestamp(run.stoppedAt) : '—' }}
                </td>
                <td
                  class="max-w-[520px] truncate px-4 py-3 text-xs text-red-400"
                  :title="run.runtimeError || ''"
                >
                  {{ run.runtimeError || '—' }}
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else class="text-muted flex h-full items-center justify-center text-sm">
            {{ t('strategy.emptyRuns') }}
          </div>
        </div>
      </section>
    </div>

    <ContextMenu
      v-model:open="strategyContextMenuOpen"
      :x="strategyContextMenuX"
      :y="strategyContextMenuY"
      :items="strategyContextMenuItems"
      @close="contextStrategy = null"
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
            <h2 class="text-base font-semibold text-white">{{ t('strategy.deleteStrategy') }}</h2>
            <p class="text-muted mt-2 text-sm">
              {{ t('strategy.deleteDescription') }}
            </p>
            <p class="mt-3 truncate text-sm text-white" :title="deleteTarget.name">
              {{ deleteTarget.name }}
            </p>
          </div>
          <div class="border-border flex justify-end gap-2 border-t px-5 py-4">
            <button
              type="button"
              class="border-border text-text inline-flex items-center justify-center rounded-md border bg-[#1e1e35] px-4 py-2 text-sm transition-colors hover:bg-[#2a2a45] disabled:opacity-50"
              :disabled="!!busyStrategyId"
              @click="closeDeleteDialog"
            >
              {{ t('common.cancel') }}
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-md border border-red-500/40 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-50"
              :disabled="!!busyStrategyId"
              @click="confirmDelete"
            >
              <LoadingSpinner
                v-if="busyStrategyId"
                :size="14"
                :title="t('strategy.deleteStrategy')"
              />
              <Trash2 v-else :size="14" />
              {{ t('common.delete') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
