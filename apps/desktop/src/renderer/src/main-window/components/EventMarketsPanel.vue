<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ChevronDown, ChevronRight, ScrollText, X } from '@lucide/vue';
import type { DbMarket, EventListItem, Market } from '@polytrader/shared';
import { formatDate, formatNum, formatOutcomePrice } from '@/shared/utils/format';
import { getMarketOutcomes } from '@/shared/utils/apiEvent';
import {
  displayMarkets,
  getMarketIcon,
  getMarketTitle,
  getStatusInfo,
  isDisplayableMarket,
} from '@/shared/utils/markets';
import { findTeamForMarket, parseEventTeams } from '@/shared/utils/teams';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';
import { useEventDetail } from '@/shared/composables/useEventDetail';
import EventTeamTitle from './EventTeamTitle.vue';

const props = defineProps<{
  event: EventListItem | null;
}>();

const emit = defineEmits<{
  close: [];
  'open-market': [
    market: DbMarket | Market,
    tokenId?: string | null,
    outcome?: string | null,
    eventId?: string | null,
  ];
}>();

const { t } = useI18n();

const { event: detailEvent, loading, error, loadEvent } = useEventDetail();
const childEvents = ref<EventListItem[]>([]);
const childEventsLoading = ref(false);
const childEventsError = ref('');
const collapsedEventIds = ref(new Set<string>());
const rulesDialogOpen = ref(false);
const PANEL_WIDTH_KEY = 'main-event-markets-panel-width';
const PANEL_DEFAULT_WIDTH = 340;
const PANEL_MIN_WIDTH = 300;
const PANEL_MAX_WIDTH = 520;

function clampPanelWidth(value: number): number {
  return Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, Math.round(value)));
}

function readPanelWidth(): number {
  const value = Number(window.localStorage.getItem(PANEL_WIDTH_KEY));
  if (!Number.isFinite(value)) return PANEL_DEFAULT_WIDTH;
  return clampPanelWidth(value);
}

const panelWidth = ref(readPanelWidth());
let resizingPanel = false;
let resizeStartX = 0;
let resizeStartWidth = 0;

const displayEvent = computed(() => detailEvent.value ?? props.event);
const displayTeams = computed(() => parseEventTeams(displayEvent.value?.teams));
const eventRules = computed(() => detailEvent.value?.description?.trim() || '');
const status = computed(() => (displayEvent.value ? getStatusInfo(displayEvent.value) : null));
const loadingAny = computed(() => loading.value || childEventsLoading.value);
const errorAny = computed(() => error.value || childEventsError.value);
const rootMarkets = computed(() =>
  displayEvent.value ? displayMarkets(displayEvent.value.markets as Array<DbMarket | Market>) : [],
);
const childEventGroups = computed(() =>
  childEvents.value.map((event) => ({
    event,
    markets: displayMarkets(event.markets as DbMarket[]),
  })),
);
const totalMarketCount = computed(() =>
  childEventGroups.value.reduce(
    (total, group) => total + group.markets.length,
    rootMarkets.value.length,
  ),
);

watch(
  () => props.event?.id,
  (eventId) => {
    if (!eventId) return;
    rulesDialogOpen.value = false;
    childEvents.value = [];
    childEventsError.value = '';
    collapsedEventIds.value = new Set();
    void loadEvent(eventId);
    void loadChildEvents(eventId);
  },
  { immediate: true },
);

async function loadChildEvents(eventId: string): Promise<void> {
  childEventsLoading.value = true;
  childEventsError.value = '';
  try {
    const events = await window.api.listChildEvents(eventId);
    childEvents.value = events;
    collapsedEventIds.value = new Set(events.map((event) => event.id));
  } catch (err) {
    childEvents.value = [];
    collapsedEventIds.value = new Set();
    childEventsError.value = err instanceof Error ? err.message : String(err);
  } finally {
    childEventsLoading.value = false;
  }
}

function startPanelWidthResize(event: MouseEvent): void {
  resizingPanel = true;
  resizeStartX = event.clientX;
  resizeStartWidth = panelWidth.value;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  window.addEventListener('mousemove', resizePanelWidth);
  window.addEventListener('mouseup', stopPanelWidthResize);
}

function resizePanelWidth(event: MouseEvent): void {
  if (!resizingPanel) return;
  panelWidth.value = clampPanelWidth(resizeStartWidth + resizeStartX - event.clientX);
}

function stopPanelWidthResize(): void {
  if (!resizingPanel) return;
  resizingPanel = false;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  window.removeEventListener('mousemove', resizePanelWidth);
  window.removeEventListener('mouseup', stopPanelWidthResize);
}

watch(panelWidth, (width) => {
  window.localStorage.setItem(PANEL_WIDTH_KEY, String(width));
});

onBeforeUnmount(() => {
  stopPanelWidthResize();
});

function outcomeClass(label: string): string {
  const lower = label.toLowerCase();
  if (lower === 'yes') {
    return 'border-[#2d6a4f] bg-[#244738] text-[#9ce0b8]';
  }
  if (lower === 'no') {
    return 'border-[#6a2d3d] bg-[#442431] text-[#f0a0a8]';
  }
  return 'border-[#3a4a7a] bg-[#263152] text-[#b9c8ff]';
}

function outcomePriceLabel(price: unknown): string {
  return price == null ? '-' : formatOutcomePrice(price);
}

function marketStatusClass(market: DbMarket | Market): string {
  return market.closed ? 'bg-[#ef4444]' : 'bg-[#22c55e]';
}

function marketStatusTitle(market: DbMarket | Market): string {
  return market.closed ? t('status.closed') : t('status.active');
}

function openMarketOutcome(
  market: DbMarket | Market,
  outcome: { tokenId: string; label: string },
  eventId: string,
): void {
  emit('open-market', market, outcome.tokenId || null, outcome.label, eventId);
}

function toggleEventGroup(eventId: string): void {
  const next = new Set(collapsedEventIds.value);
  if (next.has(eventId)) {
    next.delete(eventId);
  } else {
    next.add(eventId);
  }
  collapsedEventIds.value = next;
}

function isEventGroupCollapsed(eventId: string): boolean {
  return collapsedEventIds.value.has(eventId);
}

function eventGroupTitle(event: EventListItem): string {
  const title = event.title || t('market.eventMarkets');
  const parentTitle = displayEvent.value?.title || '';
  const prefix = `${parentTitle} - `;
  if (parentTitle && title.startsWith(prefix)) {
    return title.slice(prefix.length).trim() || title;
  }
  return title;
}

function marketIcon(
  market: DbMarket | Market,
  event: { teams?: unknown; icon?: string; image?: string },
): string {
  const teams = parseEventTeams(event.teams);
  return (
    findTeamForMarket(market, teams.length ? teams : displayTeams.value)?.logo ||
    getMarketIcon(market, event)
  );
}
</script>

<template>
  <aside
    class="border-border bg-sidebar relative flex h-full shrink-0 flex-col border-l"
    :style="{ width: `${panelWidth}px` }"
  >
    <div
      class="group absolute top-0 left-0 z-10 h-full w-2 cursor-col-resize"
      :title="t('market.resizePanel')"
      @mousedown.prevent="startPanelWidthResize"
    >
      <div class="group-hover:bg-primary/70 h-full w-0.5 bg-transparent transition-colors" />
    </div>

    <div class="border-border shrink-0 border-b px-3 py-3">
      <div class="flex items-start gap-3">
        <template v-if="!displayTeams.length">
          <img
            v-if="displayEvent?.image"
            :src="displayEvent.image"
            alt=""
            class="h-8 w-8 shrink-0 rounded-md object-cover"
          />
          <span v-else class="bg-btn-secondary block h-8 w-8 shrink-0 rounded-md" />
        </template>
        <div class="min-w-0 flex-1">
          <h2
            v-if="displayTeams.length"
            class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-snug font-semibold text-white"
          >
            <EventTeamTitle :teams="displayTeams" logo-size="md" />
          </h2>
          <h2 v-else class="text-sm leading-snug font-semibold break-words text-white">
            {{ displayEvent?.title || t('market.eventMarkets') }}
          </h2>
          <div class="text-muted mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
            <span v-if="status" class="rounded px-1.5 py-0.5 font-semibold" :class="status.class">
              {{ status.label }}
            </span>
            <span v-if="displayEvent?.end_date">
              {{ t('market.endAt', { date: formatDate(displayEvent.end_date) }) }}
            </span>
          </div>
        </div>

        <button
          type="button"
          class="hover:bg-btn-secondary text-muted-light inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:text-white"
          :title="t('market.closeEventMarkets')"
          :aria-label="t('market.closeEventMarkets')"
          @click="emit('close')"
        >
          <X :size="16" />
        </button>
      </div>
    </div>

    <div v-if="loadingAny" class="flex flex-1 items-center justify-center">
      <LoadingSpinner :size="18" :title="t('market.loadEventMarkets')" />
    </div>

    <div v-else-if="errorAny" class="flex flex-1 flex-col items-center justify-center gap-3 px-4">
      <p class="text-center text-sm text-[#f08090]">{{ errorAny }}</p>
      <button
        v-if="props.event"
        type="button"
        class="bg-primary hover:bg-primary-hover rounded-md px-3 py-2 text-sm text-white transition-colors"
        @click="
          loadEvent(props.event.id);
          loadChildEvents(props.event.id);
        "
      >
        {{ t('common.retry') }}
      </button>
    </div>

    <div
      v-else-if="!totalMarketCount"
      class="text-muted flex flex-1 items-center justify-center px-4 text-center text-sm"
    >
      {{ t('market.noActiveMarkets') }}
    </div>

    <div v-else class="min-h-0 flex-1 overflow-auto">
      <article
        v-for="market in rootMarkets"
        :key="market.id"
        class="border-border-light flex w-full flex-col gap-2 border-b px-4 py-3 text-left transition-colors hover:bg-[#1a1a2e]"
      >
        <button
          type="button"
          class="flex min-w-0 items-start gap-2.5 text-left"
          @click="emit('open-market', market, null, null, displayEvent?.id)"
        >
          <span
            class="relative mt-0.5 h-8 w-8 shrink-0"
            :title="marketStatusTitle(market)"
            :aria-label="marketStatusTitle(market)"
          >
            <img
              v-if="marketIcon(market, displayEvent ?? {})"
              :src="marketIcon(market, displayEvent ?? {})"
              alt=""
              loading="lazy"
              class="h-8 w-8 rounded-md object-cover"
            />
            <span v-else class="bg-btn-secondary block h-8 w-8 rounded-md" />
            <span
              class="border-sidebar absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2"
              :class="marketStatusClass(market)"
              :title="marketStatusTitle(market)"
              :aria-label="marketStatusTitle(market)"
            />
          </span>

          <div class="min-w-0 flex-1">
            <div class="text-[13px] leading-snug break-words text-[#ddd]">
              {{ getMarketTitle(market) }}
            </div>
            <div class="text-muted mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums">
              <span>{{ t('market.volumeValue', { value: formatNum(market.volume) }) }}</span>
              <span>{{ t('common.volume24h') }} {{ formatNum(market.volume24hr) }}</span>
              <span>{{ t('market.liquidityValue', { value: formatNum(market.liquidity) }) }}</span>
            </div>
          </div>
        </button>

        <div class="flex flex-wrap gap-1.5 pl-10">
          <button
            v-for="outcome in getMarketOutcomes(market)"
            :key="`${market.id}-${outcome.label}-${outcome.tokenId}`"
            type="button"
            class="inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium"
            :class="outcomeClass(outcome.label)"
            :title="`${outcome.label} ${outcomePriceLabel(outcome.price)}`"
            @click="openMarketOutcome(market, outcome, displayEvent?.id ?? '')"
          >
            <span class="truncate">{{ outcome.label }}</span>
            <span class="rounded bg-black/20 px-1.5 py-0.5 tabular-nums">
              {{ outcomePriceLabel(outcome.price) }}
            </span>
          </button>
        </div>
      </article>

      <section
        v-for="group in childEventGroups"
        :key="group.event.id"
        class="border-border border-b"
      >
        <button
          type="button"
          class="bg-sidebar hover:bg-btn-secondary flex w-full items-center gap-2 px-3 py-2 text-left transition-colors"
          :title="isEventGroupCollapsed(group.event.id) ? t('common.expand') : t('common.collapse')"
          :aria-label="
            isEventGroupCollapsed(group.event.id) ? t('common.expand') : t('common.collapse')
          "
          @click="toggleEventGroup(group.event.id)"
        >
          <ChevronRight v-if="isEventGroupCollapsed(group.event.id)" :size="14" />
          <ChevronDown v-else :size="14" />
          <span class="min-w-0 flex-1 truncate text-[13px] font-semibold text-white">
            {{ eventGroupTitle(group.event) }}
          </span>
          <span class="text-muted shrink-0 text-[11px] tabular-nums">
            {{ t('market.countMarkets', { count: group.markets.length }) }}
          </span>
        </button>

        <div v-if="!isEventGroupCollapsed(group.event.id)">
          <article
            v-for="market in group.markets"
            :key="market.id"
            class="border-border-light flex w-full flex-col gap-2 border-t px-4 py-3 text-left transition-colors hover:bg-[#1a1a2e]"
          >
            <button
              type="button"
              class="flex min-w-0 items-start gap-2.5 text-left"
              @click="emit('open-market', market, null, null, group.event.id)"
            >
              <span
                class="relative mt-0.5 h-8 w-8 shrink-0"
                :title="marketStatusTitle(market)"
                :aria-label="marketStatusTitle(market)"
              >
                <img
                  v-if="marketIcon(market, group.event)"
                  :src="marketIcon(market, group.event)"
                  alt=""
                  loading="lazy"
                  class="h-8 w-8 rounded-md object-cover"
                />
                <span v-else class="bg-btn-secondary block h-8 w-8 rounded-md" />
                <span
                  class="border-sidebar absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2"
                  :class="marketStatusClass(market)"
                  :title="marketStatusTitle(market)"
                  :aria-label="marketStatusTitle(market)"
                />
              </span>

              <div class="min-w-0 flex-1">
                <div class="text-[13px] leading-snug break-words text-[#ddd]">
                  {{ getMarketTitle(market) }}
                </div>
                <div
                  class="text-muted mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums"
                >
                  <span>{{ t('market.volumeValue', { value: formatNum(market.volume) }) }}</span>
                  <span>{{ t('common.volume24h') }} {{ formatNum(market.volume24hr) }}</span>
                  <span>{{
                    t('market.liquidityValue', { value: formatNum(market.liquidity) })
                  }}</span>
                </div>
              </div>
            </button>

            <div class="flex flex-wrap gap-1.5 pl-10">
              <button
                v-for="outcome in getMarketOutcomes(market)"
                :key="`${market.id}-${outcome.label}-${outcome.tokenId}`"
                type="button"
                class="inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium"
                :class="outcomeClass(outcome.label)"
                :title="`${outcome.label} ${outcomePriceLabel(outcome.price)}`"
                @click="openMarketOutcome(market, outcome, group.event.id)"
              >
                <span class="truncate">{{ outcome.label }}</span>
                <span class="rounded bg-black/20 px-1.5 py-0.5 tabular-nums">
                  {{ outcomePriceLabel(outcome.price) }}
                </span>
              </button>
            </div>
          </article>
        </div>
      </section>
    </div>

    <div
      v-if="totalMarketCount"
      class="border-border text-muted flex shrink-0 items-center justify-between border-t px-4 py-2 text-xs"
    >
      <span>{{ t('market.countMarkets', { count: totalMarketCount }) }}</span>
      <button
        type="button"
        class="text-muted-light hover:bg-btn-secondary hover:text-text inline-flex h-7 items-center gap-1.5 rounded-md px-2 transition-colors"
        :title="t('market.viewRules')"
        :aria-label="t('market.viewRules')"
        @click="rulesDialogOpen = true"
      >
        <ScrollText :size="13" />
        {{ t('market.rules') }}
      </button>
    </div>

    <Teleport to="body">
      <div
        v-if="rulesDialogOpen"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-rules-title"
        @click.self="rulesDialogOpen = false"
      >
        <div
          class="border-border bg-surface flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg border shadow-2xl shadow-black/40"
        >
          <header
            class="border-border flex shrink-0 items-center justify-between border-b px-5 py-4"
          >
            <h2 id="event-rules-title" class="text-base font-semibold text-white">
              {{ t('market.rules') }}
            </h2>
            <button
              type="button"
              class="hover:bg-btn-secondary text-muted-light inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:text-white"
              :title="t('market.closeRules')"
              :aria-label="t('market.closeRules')"
              @click="rulesDialogOpen = false"
            >
              <X :size="16" />
            </button>
          </header>
          <div class="text-muted-light min-h-0 overflow-auto px-5 py-4 text-sm leading-relaxed">
            <p v-if="eventRules" class="whitespace-pre-wrap">{{ eventRules }}</p>
            <p v-else class="text-muted">{{ t('market.noRules') }}</p>
          </div>
        </div>
      </div>
    </Teleport>
  </aside>
</template>
