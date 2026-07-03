<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  Bot,
  Briefcase,
  ClipboardList,
  History,
  PanelBottomClose,
  PanelBottomOpen,
  ReceiptText,
  ScrollText,
} from '@lucide/vue';
import type {
  ClobOrder,
  ClobTrade,
  DataPosition,
  PolymarketWalletSummary,
  StrategyBotListItem,
  StrategyRunListItem,
  StrategyRunLogEntry,
} from '@polytrader/shared';
import WalletTradesPanel from './WalletTradesPanel.vue';
import BotListPanel from './BotListPanel.vue';
import CurrentOrdersPanel from './CurrentOrdersPanel.vue';
import CurrentPositionsPanel from './CurrentPositionsPanel.vue';
import StrategyRunHistoryPanel from './StrategyRunHistoryPanel.vue';
import StrategyRunLogsPanel from './StrategyRunLogsPanel.vue';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';
import { useI18n } from 'vue-i18n';

type ActivityTab =
  | 'orders'
  | 'positions'
  | 'walletTrades'
  | 'bots'
  | 'strategyLogs'
  | 'strategyHistory';

const props = defineProps<{
  activeTab: ActivityTab;
  orders: ClobOrder[];
  cancelingOrderIds?: string[];
  strategyOrderIds: string[];
  positions: DataPosition[];
  accounts: PolymarketWalletSummary[];
  selectedWalletId: string;
  conditionId: string;
  marketNegRisk: boolean;
  positionsLoading?: boolean;
  positionsError?: string;
  walletTrades: ClobTrade[];
  walletTradesLoading?: boolean;
  walletTradesError?: string;
  strategyLogs: StrategyRunLogEntry[];
  strategyHistory: StrategyRunListItem[];
  strategyActivityLoading?: boolean;
  strategyActivityError?: string;
  selectedStrategyRunId?: string;
  eventId: string;
  marketId: string;
}>();

const emit = defineEmits<{
  'update:activeTab': [tab: ActivityTab];
  cancelOrder: [orderId: string, walletId: string];
  cancelOrders: [orderIds: string[], walletId: string];
  deleteFailedOrder: [orderId: string, walletId: string];
  selectStrategyRun: [runId: string];
  botChanged: [];
}>();

const { t } = useI18n();

const tabs = computed<Array<{ id: ActivityTab; label: string; icon: typeof ClipboardList }>>(() => [
  { id: 'positions', label: t('tradingWindow.positionsTab'), icon: Briefcase },
  { id: 'orders', label: t('tradingWindow.ordersTab'), icon: ClipboardList },
  { id: 'walletTrades', label: t('tradingWindow.tradesTab'), icon: ReceiptText },
  { id: 'bots', label: t('tradingWindow.botsTab'), icon: Bot },
  { id: 'strategyLogs', label: t('tradingWindow.strategyLogsTab'), icon: ScrollText },
  { id: 'strategyHistory', label: t('tradingWindow.strategyHistoryTab'), icon: History },
]);

const MIN_PANEL_HEIGHT = 140;
const MAX_PANEL_HEIGHT = 520;
const DEFAULT_PANEL_HEIGHT = 280;

const collapsed = ref(readPanelCollapsed(props.eventId));
const panelHeight = ref(readPanelHeight(props.eventId));
const bots = ref<StrategyBotListItem[]>([]);
const botsLoading = ref(false);
const botsError = ref('');
const busyBotId = ref('');
let dragStartY = 0;
let dragStartHeight = DEFAULT_PANEL_HEIGHT;
let syncingPanelPreferences = false;
let unsubscribeBotRuntime: (() => void) | null = null;

function panelStorageKey(eventId: string, name: string): string {
  return `trading-window:event:${encodeURIComponent(eventId)}:${name}`;
}

function readPanelCollapsed(eventId: string): boolean {
  const key = panelStorageKey(eventId, 'activity-panel-collapsed');
  return window.localStorage.getItem(key) === '1';
}

function writePanelCollapsed(eventId: string, next: boolean): void {
  const key = panelStorageKey(eventId, 'activity-panel-collapsed');
  window.localStorage.setItem(key, next ? '1' : '0');
}

function readPanelHeight(eventId: string): number {
  const key = panelStorageKey(eventId, 'activity-panel-height');
  const rawValue = window.localStorage.getItem(key);
  if (rawValue == null || rawValue.trim() === '') return DEFAULT_PANEL_HEIGHT;
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return DEFAULT_PANEL_HEIGHT;
  return clampHeight(value);
}

function writePanelHeight(eventId: string, next: number): void {
  const key = panelStorageKey(eventId, 'activity-panel-height');
  window.localStorage.setItem(key, String(next));
}

function clampHeight(value: number): number {
  return Math.min(MAX_PANEL_HEIGHT, Math.max(MIN_PANEL_HEIGHT, Math.round(value)));
}

function syncPanelPreferencesForEvent(eventId: string): void {
  syncingPanelPreferences = true;
  collapsed.value = readPanelCollapsed(eventId);
  panelHeight.value = readPanelHeight(eventId);
  syncingPanelPreferences = false;
}

function toggleCollapsed(): void {
  collapsed.value = !collapsed.value;
}

function startResize(event: MouseEvent): void {
  if (collapsed.value) return;
  dragStartY = event.clientY;
  dragStartHeight = panelHeight.value;
  document.body.style.cursor = 'row-resize';
  document.body.style.userSelect = 'none';
  window.addEventListener('mousemove', resizePanel);
  window.addEventListener('mouseup', stopResize);
}

function resizePanel(event: MouseEvent): void {
  panelHeight.value = clampHeight(dragStartHeight + dragStartY - event.clientY);
}

function stopResize(): void {
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  window.removeEventListener('mousemove', resizePanel);
  window.removeEventListener('mouseup', stopResize);
}

function tabLoading(tab: ActivityTab): boolean {
  if (tab === 'positions') return Boolean(props.positionsLoading);
  if (tab === 'walletTrades') return Boolean(props.walletTradesLoading);
  if (tab === 'bots') return botsLoading.value;
  if (tab === 'strategyLogs' || tab === 'strategyHistory') {
    return Boolean(props.strategyActivityLoading);
  }
  return false;
}

function tabCount(tab: ActivityTab): number {
  if (tab === 'orders') return props.orders.length;
  if (tab === 'positions') return props.positions.length;
  if (tab === 'walletTrades') return props.walletTrades.length;
  if (tab === 'bots') return bots.value.length;
  if (tab === 'strategyLogs') return props.strategyLogs.length;
  return props.strategyHistory.length;
}

async function refreshBots(): Promise<void> {
  if (!props.marketId) {
    bots.value = [];
    return;
  }
  botsLoading.value = true;
  botsError.value = '';
  try {
    const res = await window.api.listBots({ marketId: props.marketId, limit: 100 });
    if (!res.ok) throw new Error(res.error);
    bots.value = res.data;
  } catch (error) {
    botsError.value = error instanceof Error ? error.message : String(error);
  } finally {
    botsLoading.value = false;
  }
}

async function startBot(botId: string): Promise<void> {
  busyBotId.value = botId;
  botsError.value = '';
  try {
    const res = await window.api.startBot(botId);
    if (!res.ok) throw new Error(res.error);
    emit('botChanged');
    await refreshBots();
  } catch (error) {
    botsError.value = error instanceof Error ? error.message : String(error);
  } finally {
    busyBotId.value = '';
  }
}

async function stopBot(botId: string): Promise<void> {
  busyBotId.value = botId;
  botsError.value = '';
  try {
    const res = await window.api.stopBot(botId);
    if (!res.ok) throw new Error(res.error);
    emit('botChanged');
    await refreshBots();
  } catch (error) {
    botsError.value = error instanceof Error ? error.message : String(error);
  } finally {
    busyBotId.value = '';
  }
}

watch(
  () => props.eventId,
  (next) => {
    syncPanelPreferencesForEvent(next);
  },
);

watch(
  () => props.marketId,
  () => {
    void refreshBots();
  },
  { immediate: true },
);

watch(collapsed, (next) => {
  if (syncingPanelPreferences) return;
  writePanelCollapsed(props.eventId, next);
});

watch(panelHeight, (next) => {
  if (syncingPanelPreferences) return;
  writePanelHeight(props.eventId, next);
});

onMounted(() => {
  unsubscribeBotRuntime = window.api.onBotRuntimeEvent((event) => {
    if ('marketId' in event && event.marketId === props.marketId) {
      void refreshBots();
    }
  });
});

onUnmounted(() => {
  stopResize();
  unsubscribeBotRuntime?.();
});
</script>

<template>
  <section
    class="border-border bg-detail-bg flex shrink-0 flex-col overflow-hidden border-t"
    :style="collapsed ? undefined : { height: `${panelHeight}px` }"
  >
    <div
      v-if="!collapsed"
      class="group h-1.5 shrink-0 cursor-row-resize"
      :title="t('tradingWindow.resizeActivityPanel')"
      @mousedown="startResize"
    >
      <div class="group-hover:bg-primary/70 mx-auto h-0.5 w-16 rounded-full bg-transparent" />
    </div>

    <div class="border-border flex shrink-0 items-center justify-between gap-2 border-b px-2 py-2">
      <div class="flex min-w-0 items-center gap-1 overflow-x-auto">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          class="inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm transition-colors"
          :class="
            activeTab === tab.id
              ? 'bg-btn-secondary-hover text-white'
              : 'text-muted-light hover:bg-btn-secondary hover:text-text'
          "
          @click="emit('update:activeTab', tab.id)"
        >
          <component :is="tab.icon" :size="14" />
          <span>{{ tab.label }}</span>
          <span
            class="inline-flex min-h-4 min-w-4 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] leading-none"
            :class="activeTab === tab.id ? 'bg-primary/30 text-primary-light' : 'bg-bg text-muted'"
          >
            <LoadingSpinner
              v-if="tabLoading(tab.id)"
              :size="11"
              :title="t('tradingWindow.refreshTab', { label: tab.label })"
            />
            <template v-else>{{ tabCount(tab.id) }}</template>
          </span>
        </button>
      </div>

      <button
        type="button"
        class="hover:bg-btn-secondary text-muted-light inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:text-white"
        :title="
          collapsed
            ? t('tradingWindow.expandActivityPanel')
            : t('tradingWindow.collapseActivityPanel')
        "
        @click="toggleCollapsed"
      >
        <PanelBottomOpen v-if="collapsed" :size="16" />
        <PanelBottomClose v-else :size="16" />
      </button>
    </div>

    <CurrentOrdersPanel
      v-if="!collapsed && activeTab === 'orders'"
      embedded
      :orders="orders"
      :canceling-order-ids="cancelingOrderIds"
      :strategy-order-ids="strategyOrderIds"
      @cancel="(orderId, walletId) => emit('cancelOrder', orderId, walletId)"
      @cancel-all="(orderIds, walletId) => emit('cancelOrders', orderIds, walletId)"
      @delete-failed="(orderId, walletId) => emit('deleteFailedOrder', orderId, walletId)"
    />
    <CurrentPositionsPanel
      v-else-if="!collapsed && activeTab === 'positions'"
      embedded
      :positions="positions"
      :accounts="accounts"
      :selected-wallet-id="selectedWalletId"
      :condition-id="conditionId"
      :market-neg-risk="marketNegRisk"
      :loading="positionsLoading"
      :error="positionsError"
    />
    <WalletTradesPanel
      v-else-if="!collapsed && activeTab === 'walletTrades'"
      embedded
      :trades="walletTrades"
      :loading="walletTradesLoading"
      :error="walletTradesError"
    />
    <BotListPanel
      v-else-if="!collapsed && activeTab === 'bots'"
      :bots="bots"
      :loading="botsLoading"
      :error="botsError"
      :busy-bot-id="busyBotId"
      @start="startBot"
      @stop="stopBot"
    />
    <StrategyRunLogsPanel
      v-else-if="!collapsed && activeTab === 'strategyLogs'"
      embedded
      :logs="strategyLogs"
      :loading="strategyActivityLoading"
      :error="strategyActivityError"
    />
    <StrategyRunHistoryPanel
      v-else-if="!collapsed && activeTab === 'strategyHistory'"
      embedded
      :history="strategyHistory"
      :selected-run-id="selectedStrategyRunId"
      :loading="strategyActivityLoading"
      :error="strategyActivityError"
      @select-run="emit('selectStrategyRun', $event)"
    />
  </section>
</template>
