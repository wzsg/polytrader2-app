<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { AuthState, DbMarket, EventListItem, Market } from '@polytrader/shared';
import AuthAccountPanel from './components/AuthAccountPanel.vue';
import CloseConfirmDialog from './components/CloseConfirmDialog.vue';
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
import { useSync } from '../shared/composables/useSync';
import { translateUiKey } from '../shared/i18n';
import { getSingleOpenMarket } from '../shared/utils/markets';
import { getMarketOutcomes } from '../shared/utils/apiEvent';

interface ReloadableListView {
  reload: () => Promise<void>;
}

const hiddenStrategyAutomationNavs = new Set(['bots', 'strategies']);
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
const developerModeEnabled = ref(false);
const appVersion = `v${__APP_VERSION__}`;
const authPanelOpen = ref(false);
const authState = ref<AuthState>({
  configured: false,
  status: 'disabled',
  user: null,
  email: null,
  syncState: 'idle',
  error: null,
});
let unsubscribeCloseRequested: (() => void) | null = null;
let unsubscribeNavigate: (() => void) | null = null;
let unsubscribeAuth: (() => void) | null = null;

const { loadPersistedFilters } = useFilters();
const selectedEventId = computed(() => selectedEvent.value?.id ?? null);
const eventPanelVisible = computed(
  () =>
    !!selectedEvent.value &&
    (activeNav.value === 'events' ||
      activeNav.value === 'watchlist' ||
      activeNav.value === 'crypto' ||
      activeNav.value === 'sports' ||
      activeNav.value === 'esports'),
);

const { syncState, syncStatus, setupSync, toggleSync } = useSync(async () => {
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
});

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

async function openEventDetail(event: EventListItem, metadata?: unknown): Promise<void> {
  const single = getSingleOpenMarket(event);
  if (single) {
    try {
      const childEvents = await window.api.listChildEvents(event.id);
      if (!childEvents.length) {
        openTradingWindowForMarket(single, event.id, null, null, metadata);
        return;
      }
    } catch {
      selectedEvent.value = event;
      selectedEventMetadata.value = metadata;
      return;
    }
  }

  selectedEvent.value = event;
  selectedEventMetadata.value = metadata;
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

onMounted(async () => {
  unsubscribeCloseRequested = window.api.onMainWindowCloseRequested(requestCloseConfirm);
  unsubscribeNavigate = window.api.onMainWindowNavigate((nav) => handleNavChange(nav));
  authState.value = await window.api.getAuthState();
  unsubscribeAuth = window.api.onAuthChanged((state) => {
    authState.value = state;
  });
  developerModeEnabled.value = (await window.api.getDeveloperModeConfig()).enabled;
  setupSync();
  preloadSportsMetadata();
  await loadPersistedFilters();
});

onUnmounted(() => {
  unsubscribeCloseRequested?.();
  unsubscribeNavigate?.();
  unsubscribeAuth?.();
});
</script>

<template>
  <div class="flex h-full flex-col">
    <TitleBar :subtitle="appVersion" :status-text="authStatusText" show-brand-icon />

    <div class="flex min-h-0 flex-1">
      <Sidebar
        :active-nav="activeNav"
        :developer-mode-enabled="developerModeEnabled"
        :auth-state="authState"
        @change-nav="handleNavChange"
        @open-auth="authPanelOpen = true"
      />

      <main class="flex min-w-0 flex-1 overflow-hidden">
        <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
          <WalletsView v-if="activeNav === 'accounts'" />
          <BotsView v-else-if="activeNav === 'bots'" />
          <StrategiesView v-else-if="activeNav === 'strategies'" />
          <SettingsView
            v-else-if="activeNav === 'settings'"
            :sync-state="syncState"
            :sync-status="syncStatus"
            :auth-state="authState"
            @toggle-sync="toggleSync"
            @developer-mode-change="handleDeveloperModeChange"
          />
          <DeveloperModeView v-else-if="activeNav === 'developer' && developerModeEnabled" />

          <EventsListView
            v-else-if="activeNav === 'events'"
            ref="eventsListRef"
            :selected-event-id="selectedEventId"
            :sync-state="syncState"
            :sync-status="syncStatus"
            @open-detail="openEventDetail"
          />
          <WatchlistView
            v-else-if="activeNav === 'watchlist'"
            ref="watchlistRef"
            :selected-event-id="selectedEventId"
            :sync-state="syncState"
            :sync-status="syncStatus"
            @open-detail="openEventDetail"
          />
          <CryptoEventsView
            v-else-if="activeNav === 'crypto'"
            ref="cryptoEventsRef"
            :selected-event-id="selectedEventId"
            :sync-state="syncState"
            :sync-status="syncStatus"
            @open-detail="openEventDetail"
          />
          <SportsEventsView
            v-else-if="activeNav === 'sports'"
            ref="sportsEventsRef"
            :selected-event-id="selectedEventId"
            :sync-state="syncState"
            :sync-status="syncStatus"
            @open-detail="openEventDetail"
          />
          <EsportsEventsView
            v-else-if="activeNav === 'esports'"
            ref="esportsEventsRef"
            :selected-event-id="selectedEventId"
            :sync-state="syncState"
            :sync-status="syncStatus"
            @open-detail="openEventDetail"
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
    <AuthAccountPanel
      :open="authPanelOpen"
      :auth-state="authState"
      @close="authPanelOpen = false"
    />
  </div>
</template>
