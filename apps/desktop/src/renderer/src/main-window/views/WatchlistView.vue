<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ChevronDown, ListFilter, RotateCcw } from '@lucide/vue';
import AppHeader from '../components/AppHeader.vue';
import FilterBar from '../components/FilterBar.vue';
import StatsBar from '../components/StatsBar.vue';
import EventsTable from '../components/EventsTable.vue';
import EventSyncStatusIndicator from '../components/EventSyncStatusIndicator.vue';
import Pagination from '../../shared/components/Pagination.vue';
import { WATCHLIST_DEFAULT_FILTERS, useFilters } from '../../shared/composables/useFilters';
import { useEventList } from '../../shared/composables/useEventList';

import type { EventListItem } from '@polytrader/shared';

const emit = defineEmits<{
  'open-detail': [event: EventListItem];
  'open-trading': [event: EventListItem];
}>();

defineProps<{
  selectedEventId?: string | null;
  syncState?: string;
  syncStatus?: string;
}>();

const { t } = useI18n();

const {
  filters,
  defaultFilters,
  loadPersistedFilters,
  resetFilters,
  setSortField,
  onFiltersChange,
} = useFilters({
  defaultFilters: WATCHLIST_DEFAULT_FILTERS,
  statusPersistenceKey: 'watchlistStatus',
  sortPersistenceKeys: {
    field: 'watchlistSortField',
    order: 'watchlistSortOrder',
  },
});

const list = useEventList(filters, { watchlistOnly: true });
const filterPanelOpen = ref(false);

const FILTER_STATE_KEYS = [
  'search',
  'volume24hrMin',
  'volume24hrMax',
  'volumeMin',
  'volumeMax',
  'liquidityMin',
  'liquidityMax',
  'marketCountMin',
  'marketCountMax',
  'endDateMin',
  'endDateMax',
  'status',
] as const;

onFiltersChange(() => list.onFiltersChanged());

const canPrev = computed(() => list.currentPage.value > 1);
const canNext = computed(() => list.currentPage.value < list.totalPages.value);
const hasActiveFilters = computed(() =>
  FILTER_STATE_KEYS.some((key) => filters[key] !== defaultFilters[key]),
);
const filterButtonTitle = computed(() => {
  if (filterPanelOpen.value) return t('filter.collapse');
  return hasActiveFilters.value ? t('filter.expandActive') : t('filter.expand');
});

onMounted(async () => {
  await loadPersistedFilters();
  await list.refreshWatchlistEventIds();
  await list.loadEvents();
});

function toggleFilterPanel(): void {
  filterPanelOpen.value = !filterPanelOpen.value;
}

function reload() {
  list.currentPage.value = 1;
  return list.loadEvents();
}

defineExpose({ reload });
</script>

<template>
  <AppHeader :title="t('nav.watchlist')">
    <template #actions>
      <button
        type="button"
        class="inline-flex h-8 items-center justify-center gap-2 rounded-md border px-3 text-sm transition-colors"
        :class="
          hasActiveFilters
            ? 'border-primary/60 bg-primary/20 text-primary hover:bg-primary/25'
            : 'border-border bg-btn-secondary text-text hover:bg-btn-secondary-hover'
        "
        :title="filterButtonTitle"
        :aria-label="filterButtonTitle"
        aria-controls="watchlist-filters"
        :aria-expanded="filterPanelOpen"
        @click="toggleFilterPanel"
      >
        <ListFilter :size="14" />
        {{ hasActiveFilters ? t('filter.active') : t('filter.inactive') }}
        <ChevronDown
          :size="14"
          class="transition-transform"
          :class="{ 'rotate-180': filterPanelOpen }"
        />
      </button>
    </template>
  </AppHeader>

  <FilterBar v-if="filterPanelOpen" id="watchlist-filters" :filters="filters">
    <template #actions>
      <button
        type="button"
        class="border-border bg-btn-secondary text-text hover:bg-btn-secondary-hover inline-flex h-8 items-center justify-center gap-2 rounded-md border px-3 text-sm transition-colors"
        :title="t('filter.reset')"
        :aria-label="t('filter.reset')"
        @click="resetFilters"
      >
        <RotateCcw :size="14" />
        {{ t('common.reset') }}
      </button>
    </template>
  </FilterBar>

  <StatsBar
    variant="watchlist"
    :total-count="list.totalCount.value"
    :filtered-count="list.filteredCount.value"
    :active-count="list.activeCount.value"
  >
    <template #actions>
      <EventSyncStatusIndicator :sync-state="syncState" :sync-status="syncStatus" />
    </template>
  </StatsBar>

  <EventsTable
    :events="list.pageEvents.value"
    :filters="filters"
    :selected-event-id="selectedEventId"
    :is-in-watchlist="list.isInWatchlist"
    @sort="setSortField"
    @toggle-watchlist="list.handleToggleWatchlist"
    @open-detail="emit('open-detail', $event)"
    @open-trading="emit('open-trading', $event)"
  />

  <Pagination
    :page-info="list.pageInfo.value"
    :can-prev="canPrev"
    :can-next="canNext"
    @prev="list.goPrevPage"
    @next="list.goNextPage"
  />
</template>
