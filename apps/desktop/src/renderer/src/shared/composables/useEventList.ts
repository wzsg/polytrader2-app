import { ref, computed } from 'vue';
import type { Filters } from '@polytrader/shared';
import type { EventListItem } from '@polytrader/shared';
import { translateUiKey } from '../i18n';
import { filtersToQuery } from './useFilters';
import { useWatchlist } from './useWatchlist';

const PAGE_SIZE = 50;

interface EventListOptions {
  watchlistOnly?: boolean;
  getTagFilter?: () => {
    tagIds?: string[];
    excludeTagIds?: string[];
  };
}

export function useEventList(
  filters: Filters,
  { watchlistOnly = false, getTagFilter }: EventListOptions = {},
) {
  const { refreshWatchlistEventIds, toggleWatchlist, isInWatchlist } = useWatchlist();

  const currentPage = ref(1);
  const pageEvents = ref<EventListItem[]>([]);
  const filteredCount = ref(0);
  const totalCount = ref(0);
  const activeCount = ref(0);
  const loading = ref(false);
  const error = ref('');

  const totalPages = computed(() => Math.max(1, Math.ceil(filteredCount.value / PAGE_SIZE)));
  const pageInfo = computed(() =>
    translateUiKey('page.indicator', { current: currentPage.value, total: totalPages.value }),
  );

  async function loadEvents(): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
      const params = filtersToQuery(filters, {
        watchlistOnly,
        currentPage: currentPage.value,
        pageSize: PAGE_SIZE,
      });
      const tagFilter = getTagFilter?.();
      if (tagFilter) {
        params.tagIds = tagFilter.tagIds;
        params.excludeTagIds = tagFilter.excludeTagIds;
      }

      if (watchlistOnly) {
        const [events, filtered, total, active] = await Promise.all([
          window.api.listEvents(params),
          window.api.countEvents(params),
          window.api.countWatchlist(),
          window.api.countActive(),
        ]);
        pageEvents.value = events;
        filteredCount.value = filtered;
        totalCount.value = total;
        activeCount.value = active;
      } else {
        const [events, filtered, total, active] = await Promise.all([
          window.api.listEvents(params),
          window.api.countEvents(params),
          window.api.getTotalCount(),
          window.api.countActive(),
        ]);
        pageEvents.value = events;
        filteredCount.value = filtered;
        totalCount.value = total;
        activeCount.value = active;
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }

  function onFiltersChanged(): void {
    currentPage.value = 1;
    loadEvents();
  }

  function goPrevPage(): void {
    if (currentPage.value > 1) {
      currentPage.value--;
      loadEvents();
    }
  }

  function goNextPage(): void {
    if (currentPage.value < totalPages.value) {
      currentPage.value++;
      loadEvents();
    }
  }

  async function handleToggleWatchlist(eventId: string): Promise<void> {
    const wasListed = isInWatchlist(eventId);
    const result = await toggleWatchlist(eventId);
    if (!result) return;

    if (watchlistOnly && wasListed) {
      await loadEvents();
    } else if (!watchlistOnly) {
      const total = await window.api.getTotalCount();
      totalCount.value = total;
    }
  }

  return {
    currentPage,
    pageEvents,
    filteredCount,
    totalCount,
    activeCount,
    loading,
    error,
    totalPages,
    pageInfo,
    refreshWatchlistEventIds,
    loadEvents,
    onFiltersChanged,
    goPrevPage,
    goNextPage,
    handleToggleWatchlist,
    isInWatchlist,
  };
}
