<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ChevronDown, ListFilter, RotateCcw } from '@lucide/vue';
import AppHeader from '../components/AppHeader.vue';
import EventCategoryBar from '../components/EventCategoryBar.vue';
import EventSearchBox from '../components/EventSearchBox.vue';
import FilterBar from '../components/FilterBar.vue';
import StatsBar from '../components/StatsBar.vue';
import EventsTable from '../components/EventsTable.vue';
import Pagination from '../../shared/components/Pagination.vue';
import { EVENT_LIST_DEFAULT_FILTERS, useFilters } from '../../shared/composables/useFilters';
import { useEventCategory } from '../../shared/composables/useEventCategory';
import { useEventList } from '../../shared/composables/useEventList';

import type { EventListItem } from '@polytrader/shared';

const emit = defineEmits<{
  'open-detail': [event: EventListItem];
  'open-trading': [event: EventListItem];
}>();

defineProps<{
  selectedEventId?: string | null;
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
  defaultFilters: EVENT_LIST_DEFAULT_FILTERS,
  statusPersistenceKey: 'eventStatus',
  sortPersistenceKeys: {
    field: 'eventSortField',
    order: 'eventSortOrder',
    useLegacyFallback: true,
  },
});

const eventCategory = useEventCategory();
const selectedCategorySlug = ref('');
const list = useEventList(filters, {
  watchlistOnly: false,
  getTagFilter: () =>
    eventCategory.resolveEventCategoryFilter(
      eventCategory.config.value,
      selectedCategorySlug.value,
    ),
});
const filterPanelOpen = ref(false);

const FILTER_STATE_KEYS = [
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
  const saved = await window.api.loadFilters();
  selectedCategorySlug.value =
    typeof saved?.eventCategorySlug === 'string' ? saved.eventCategorySlug : '';
  await loadPersistedFilters();
  const categoryConfig = await eventCategory.loadCategory();
  if (categoryConfig) {
    const validCategorySlug = eventCategory.validateEventCategorySlug(
      categoryConfig,
      selectedCategorySlug.value,
    );
    if (validCategorySlug !== selectedCategorySlug.value) {
      selectedCategorySlug.value = validCategorySlug;
      await window.api.saveFilters({ eventCategorySlug: validCategorySlug });
    }
  }
  await list.refreshWatchlistEventIds();
  await list.loadEvents();
});

function toggleFilterPanel(): void {
  filterPanelOpen.value = !filterPanelOpen.value;
}

function resetFilterPanel(): void {
  const search = filters.search;
  resetFilters();
  filters.search = search;
}

function reload() {
  list.currentPage.value = 1;
  return list.loadEvents();
}

function handleCategoryChange(slug: string): void {
  if (selectedCategorySlug.value === slug) return;
  selectedCategorySlug.value = slug;
  void window.api.saveFilters({ eventCategorySlug: slug });
  list.onFiltersChanged();
}

defineExpose({ reload });
</script>

<template>
  <AppHeader :aria-label="t('nav.events')">
    <EventCategoryBar
      :category="eventCategory.config.value"
      :selected-slug="selectedCategorySlug"
      :loading="eventCategory.loading.value"
      :error="eventCategory.error.value"
      @update:selected-slug="handleCategoryChange"
    />

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
        aria-controls="event-list-filters"
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

  <FilterBar v-if="filterPanelOpen" id="event-list-filters" :filters="filters">
    <template #actions>
      <button
        type="button"
        class="border-border bg-btn-secondary text-text hover:bg-btn-secondary-hover inline-flex h-8 items-center justify-center gap-2 rounded-md border px-3 text-sm transition-colors"
        :title="t('filter.reset')"
        :aria-label="t('filter.reset')"
        @click="resetFilterPanel"
      >
        <RotateCcw :size="14" />
        {{ t('common.reset') }}
      </button>
    </template>
  </FilterBar>

  <StatsBar
    variant="events"
    :total-count="list.totalCount.value"
    :filtered-count="list.filteredCount.value"
    :active-count="list.activeCount.value"
  >
    <template #actions>
      <EventSearchBox :filters="filters" />
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
