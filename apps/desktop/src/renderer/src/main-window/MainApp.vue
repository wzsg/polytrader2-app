<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type {
  AppUpdateState,
  AuthState,
  DbMarket,
  EventListItem,
  Market,
} from '@polytrader/shared';
import { Download } from '@lucide/vue';
import AuthAccountPanel from './components/AuthAccountPanel.vue';
import CloseConfirmDialog from './components/CloseConfirmDialog.vue';
import UpdateConfirmDialog from './components/UpdateConfirmDialog.vue';
import Sidebar from './components/Sidebar.vue';
import EventMarketsPanel from './components/EventMarketsPanel.vue';
import WalletsView from './views/WalletsView.vue';
import BotsView from './views/BotsView.vue';
import StrategiesView from './views/StrategiesView.vue';
import SettingsView from './views/SettingsView.vue';
import DeveloperModeView from './views/developer-mode/DeveloperModeView.vue';
import EventsListView from './views/EventsListView.vue';
import WatchlistView from './views/WatchlistView.vue';
import CryptoEventsView from './views/CryptoEventsView.vue';
import SportsEventsView from './views/SportsEventsView.vue';
import EsportsEventsView from './views/EsportsEventsView.vue';
import TitleBar from '../shared/components/TitleBar.vue';
import { useFilters } from '../shared/composables/useFilters';
import { preloadSportsMetadata } from '../shared/composables/sportsMetadata';
import { useEventSync } from '../shared/composables/useEventSync';
import { useWatchlist } from '../shared/composables/useWatchlist';
import { translateUiKey } from '../shared/i18n';
import { displayMarkets, getSingleOpenMarket } from '../shared/utils/markets';
import { getMarketOutcomes } from '../shared/utils/apiEvent';
import { createRequestId } from '../shared/utils/request';

interface ReloadableListView {
  reload: () => Promise<void>;
}

const hiddenStrategyAutomationNavs = new Set(['bots', 'strategies']);
const accountDataSyncEnabled = __ACCOUNT_DATA_SYNC_ENABLED__;
const strategyAutomationEnabled = __STRATEGY_AUTOMATION_ENABLED__;
const activeNav = ref('events');
const selectedEvent = ref<EventListItem | null>(null);
const selectedEventMetadata = ref<unknown>();
const eventsListRef = ref<ReloadableListView | null>(null);
const watchlistRef = ref<ReloadableListView | null>(null);
const cryptoEventsRef = ref<ReloadableListView | null>(null);
const sportsEventsRef = ref<ReloadableListView | null>(null);
const esportsEventsRef = ref<ReloadableListView | null>(null);
const closeConfirmOpen = ref(false);
const updateConfirmOpen = ref(false);
const developerModeEnabled = ref(false);
const appVersion = `v${__APP_VERSION__}`;
const appUpdateState = ref<AppUpdateState>({ status: 'idle', version: null });
const updateInstallRequested = ref(false);
const authPanelOpen = ref(false);
const authState = ref<AuthState>({
  configured: false,
  status: 'disabled',
  user: null,
  email: null,
  dataSyncState: 'idle',
  dataSyncError: null,
  error: null,
});
let unsubscribeCloseRequested: (() => void) | null = null;
let eventDetailRequestId = '';
let eventTradingRequestId = '';
let unsubscribeNavigate: (() => void) | null = null;
let unsubscribeAuth: (() => void) | null = null;
let unsubscribeAppUpdate: (() => void) | null = null;
let unsubscribeEventSync: (() => void) | null = null;
let mainAppUnmounted = false;

const { loadPersistedFilters } = useFilters();
const selectedEventId = computed(() => selectedEvent.value?.id ?? null);
const { openWatchlistEventCount, refreshOpenWatchlistEventCount } = useWatchlist();
const eventPanelVisible = computed(
  () =>
    !!selectedEvent.value &&
    (activeNav.value === 'events' ||
      activeNav.value === 'watchlist' ||
      activeNav.value === 'crypto' ||
      activeNav.value === 'sports' ||
      activeNav.value === 'esports'),
);
const updateReady = computed(
  () => appUpdateState.value.status === 'downloaded' && !!appUpdateState.value.version,
);
const newAppVersion = computed(() => {
  const version = appUpdateState.value.version;
  if (!version) return '';
  return version.startsWith('v') ? version : `v${version}`;
});

const { eventSyncState, eventSyncStatus, setupEventSync, toggleEventSync } = useEventSync(
  async () => {
    if (mainAppUnmounted) return;
    if (activeNav.value === 'events') {
      await eventsListRef.value?.reload();
    } else if (activeNav.value === 'watchlist') {
      await watchlistRef.value?.reload();
    } else if (activeNav.value === 'crypto') {
      await cryptoEventsRef.value?.reload();
    } else if (activeNav.value === 'sports') {
      await sportsEventsRef.value?.reload();
    } else if (activeNav.value === 'esports') {
      await esportsEventsRef.value?.reload();
    }
    if (mainAppUnmounted) return;
    await refreshOpenWatchlistEventCount();
  },
);

const authStatusText = computed(() => {
  if (!authState.value.configured || authState.value.status === 'disabled') return '';
  if (authState.value.status === 'signed-in') {
    return authState.value.email
      ? `${translateUiKey('auth.signedIn')}: ${authState.value.email}`
      : translateUiKey('auth.signedIn');
  }
  return translateUiKey('auth.notSignedIn');
});

function isNavAllowed(nav: string): boolean {
  if (!strategyAutomationEnabled && hiddenStrategyAutomationNavs.has(nav)) return false;
  if (nav === 'developer' && !developerModeEnabled.value) return false;
  return true;
}

function handleNavChange(nav: string): void {
  if (!isNavAllowed(nav)) return;
  activeNav.value = nav;
  selectedEvent.value = null;
  selectedEventMetadata.value = undefined;
}

function handleDeveloperModeChange(enabled: boolean): void {
  developerModeEnabled.value = enabled;
  if (!enabled && activeNav.value === 'developer') {
    handleNavChange('settings');
  }
}

function openTradingWindowForMarket(
  market: DbMarket | Market,
  eventId: string,
  tokenId?: string | null,
  outcome?: string | null,
  metadata?: unknown,
): void {
  const fallbackOutcome = getMarketOutcomes(market)[0];
  window.api.openTradingWindow({
    marketId: market.id,
    eventId,
    tokenId: tokenId || fallbackOutcome?.tokenId || null,
    outcome: outcome ?? fallbackOutcome?.label ?? null,
    metadata: cloneTradingMetadata(metadata),
  });
}

function cloneTradingMetadata(metadata: unknown): unknown {
  if (metadata === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(metadata));
  } catch {
    return undefined;
  }
}

function showEventDetailPanel(event: EventListItem, metadata?: unknown): void {
  selectedEvent.value = event;
  selectedEventMetadata.value = metadata;
}

async function openEventDetail(event: EventListItem, metadata?: unknown): Promise<void> {
  const requestId = createRequestId();
  eventDetailRequestId = requestId;
  if (activeNav.value === 'crypto') {
    try {
      const marketsResponse = await window.api.listEventMarkets({
        requestId,
        data: { eventId: event.id },
      });
      if (marketsResponse.requestId !== eventDetailRequestId) return;
      const single = getSingleOpenMarket({ markets: marketsResponse.data });
      if (single) {
        const childrenResponse = await window.api.listChildEvents({
          requestId,
          data: { parentEventId: event.id },
        });
        if (childrenResponse.requestId !== eventDetailRequestId) return;
        if (!childrenResponse.data.length) {
          openTradingWindowForMarket(single, event.id, null, null, metadata);
          return;
        }
      }
    } catch {
      showEventDetailPanel(event, metadata);
      return;
    }
  }

  showEventDetailPanel(event, metadata);
}

function getDefaultOpenMarket(
  markets: Array<DbMarket | Market> | undefined,
): DbMarket | Market | null {
  return displayMarkets(markets).find((market) => !market.closed) ?? null;
}

async function openEventTrading(event: EventListItem, metadata?: unknown): Promise<void> {
  const requestId = createRequestId();
  eventTradingRequestId = requestId;
  try {
    const marketsResponse = await window.api.listEventMarkets({
      requestId,
      data: { eventId: event.id },
    });
    if (marketsResponse.requestId !== eventTradingRequestId) return;
    const market = getDefaultOpenMarket(marketsResponse.data);
    if (market) {
      openTradingWindowForMarket(market, event.id, null, null, metadata);
      return;
    }

    const childrenResponse = await window.api.listChildEvents({
      requestId,
      data: { parentEventId: event.id },
    });
    if (childrenResponse.requestId !== eventTradingRequestId) return;
    for (const childEvent of childrenResponse.data) {
      const childMarket = getDefaultOpenMarket(childEvent.markets as DbMarket[]);
      if (!childMarket) continue;
      openTradingWindowForMarket(childMarket, childEvent.id, null, null, metadata);
      return;
    }
  } catch {
    // Fall back to the event market panel below.
  }

  showEventDetailPanel(event, metadata);
}

function closeEventDetail(): void {
  selectedEvent.value = null;
  selectedEventMetadata.value = undefined;
}

function openEventMarket(
  market: DbMarket | Market,
  tokenId?: string | null,
  outcome?: string | null,
  eventIdOverride?: string | null,
): void {
  const eventId = eventIdOverride || selectedEvent.value?.id;
  if (!eventId) return;
  openTradingWindowForMarket(market, eventId, tokenId, outcome, selectedEventMetadata.value);
}

function requestCloseConfirm(): void {
  closeConfirmOpen.value = true;
}

function cancelCloseConfirm(): void {
  closeConfirmOpen.value = false;
}

async function confirmClose(): Promise<void> {
  closeConfirmOpen.value = false;
  await window.api.confirmMainWindowClose();
}

function requestAppUpdateInstallation(): void {
  if (!updateReady.value || updateInstallRequested.value) return;
  updateConfirmOpen.value = true;
}

function cancelAppUpdateInstallation(): void {
  updateConfirmOpen.value = false;
}

async function confirmAppUpdateInstallation(): Promise<void> {
  if (!updateReady.value || updateInstallRequested.value) return;
  updateConfirmOpen.value = false;
  updateInstallRequested.value = true;
  try {
    const started = await window.api.installAppUpdate();
    if (!started) updateInstallRequested.value = false;
  } catch {
    updateInstallRequested.value = false;
  }
}

onMounted(async () => {
  unsubscribeCloseRequested = window.api.onMainWindowCloseRequested(requestCloseConfirm);
  unsubscribeNavigate = window.api.onMainWindowNavigate((nav) => handleNavChange(nav));
  if (accountDataSyncEnabled) {
    const nextAuthState = await window.api.getAuthState();
    if (mainAppUnmounted) return;
    authState.value = nextAuthState;
    unsubscribeAuth = window.api.onAuthChanged((state) => {
      authState.value = state;
    });
  }
  const nextAppUpdateState = await window.api.getAppUpdateState();
  if (mainAppUnmounted) return;
  appUpdateState.value = nextAppUpdateState;
  unsubscribeAppUpdate = window.api.onAppUpdateStateChanged((state) => {
    appUpdateState.value = state;
    if (state.status !== 'downloaded') {
      updateConfirmOpen.value = false;
      updateInstallRequested.value = false;
    }
  });
  const developerModeConfig = await window.api.getDeveloperModeConfig();
  if (mainAppUnmounted) return;
  developerModeEnabled.value = developerModeConfig.enabled;
  unsubscribeEventSync = setupEventSync();
  preloadSportsMetadata();
  await loadPersistedFilters();
  if (mainAppUnmounted) return;
  await refreshOpenWatchlistEventCount();
});

onUnmounted(() => {
  mainAppUnmounted = true;
  unsubscribeCloseRequested?.();
  unsubscribeNavigate?.();
  unsubscribeAuth?.();
  unsubscribeAppUpdate?.();
  unsubscribeEventSync?.();
});
</script>

<template>
  <div class="flex h-full flex-col">
    <TitleBar :subtitle="appVersion" :status-text="authStatusText" show-brand-icon>
      <template #subtitle-action>
        <button
          v-if="updateReady"
          type="button"
          class="app-no-drag border-primary/50 bg-primary/15 text-primary-light hover:bg-primary/25 inline-flex h-5 items-center gap-1 rounded border px-2 text-[10px] leading-none font-medium transition-colors disabled:cursor-default disabled:opacity-60"
          :disabled="updateInstallRequested"
          :title="
            translateUiKey('update.installTitle', {
              version: appUpdateState.version,
            })
          "
          @click.stop="requestAppUpdateInstallation"
          @dblclick.stop
        >
          <Download :size="11" :stroke-width="2" />
          {{ translateUiKey('update.install') }}
        </button>
      </template>
    </TitleBar>

    <div class="flex min-h-0 flex-1">
      <Sidebar
        :active-nav="activeNav"
        :developer-mode-enabled="developerModeEnabled"
        :auth-state="authState"
        :open-watchlist-event-count="openWatchlistEventCount"
        @change-nav="handleNavChange"
        @open-auth="authPanelOpen = accountDataSyncEnabled"
      />

      <main class="flex min-w-0 flex-1 overflow-hidden">
        <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
          <WalletsView v-if="activeNav === 'accounts'" />
          <BotsView v-else-if="activeNav === 'bots'" />
          <StrategiesView v-else-if="activeNav === 'strategies'" />
          <SettingsView
            v-else-if="activeNav === 'settings'"
            :event-sync-state="eventSyncState"
            :event-sync-status="eventSyncStatus"
            :auth-state="authState"
            @toggle-event-sync="toggleEventSync"
            @developer-mode-change="handleDeveloperModeChange"
          />
          <DeveloperModeView v-else-if="activeNav === 'developer' && developerModeEnabled" />

          <EventsListView
            v-else-if="activeNav === 'events'"
            ref="eventsListRef"
            :selected-event-id="selectedEventId"
            @open-detail="openEventDetail"
            @open-trading="openEventTrading"
          />
          <WatchlistView
            v-else-if="activeNav === 'watchlist'"
            ref="watchlistRef"
            :selected-event-id="selectedEventId"
            @open-detail="openEventDetail"
            @open-trading="openEventTrading"
          />
          <CryptoEventsView
            v-else-if="activeNav === 'crypto'"
            ref="cryptoEventsRef"
            :selected-event-id="selectedEventId"
            @open-detail="openEventDetail"
            @open-trading="openEventTrading"
          />
          <SportsEventsView
            v-else-if="activeNav === 'sports'"
            ref="sportsEventsRef"
            :selected-event-id="selectedEventId"
            @open-detail="openEventDetail"
            @open-trading="openEventTrading"
          />
          <EsportsEventsView
            v-else-if="activeNav === 'esports'"
            ref="esportsEventsRef"
            :selected-event-id="selectedEventId"
            @open-detail="openEventDetail"
            @open-trading="openEventTrading"
          />
        </div>

        <EventMarketsPanel
          v-if="eventPanelVisible"
          :event="selectedEvent"
          @close="closeEventDetail"
          @open-market="openEventMarket"
        />
      </main>
    </div>

    <CloseConfirmDialog
      :open="closeConfirmOpen"
      @cancel="cancelCloseConfirm"
      @confirm="confirmClose"
    />
    <UpdateConfirmDialog
      :open="updateConfirmOpen"
      :current-version="appVersion"
      :new-version="newAppVersion"
      @cancel="cancelAppUpdateInstallation"
      @confirm="confirmAppUpdateInstallation"
    />
    <AuthAccountPanel
      v-if="accountDataSyncEnabled"
      :open="authPanelOpen"
      :auth-state="authState"
      @close="authPanelOpen = false"
    />
  </div>
</template>
