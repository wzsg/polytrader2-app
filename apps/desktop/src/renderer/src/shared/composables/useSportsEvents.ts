import { computed, reactive, ref, watch } from 'vue';
import type { EventListItem, Filters, SortOrder } from '@polytrader/shared';
import type { SportsMetadataItem } from '@polytrader/shared';
import { translateUiKey } from '../i18n';
import { fetchSportsMetadataOnce } from './sportsMetadata';
import { useWatchlist } from './useWatchlist';

const PAGE_SIZE = 50;
const SPORTS_TAG_ID = '1';
const ESPORTS_TAG_ID = '64';

const SPORTS_SORT_FIELDS = new Set([
  'volume24hr',
  'volume',
  'liquidity',
  'title',
  'end_date',
  'active',
  'closed',
  'market_count',
]);

type SportsEventsFilters = Pick<
  Filters,
  | 'search'
  | 'sortField'
  | 'sortOrder'
  | 'cryptoCoin'
  | 'cryptoMarketMode'
  | 'cryptoTimeframe'
  | 'sportsSport'
>;

const DEFAULT_SPORTS_FILTERS: SportsEventsFilters = {
  search: '',
  sortField: 'end_date',
  sortOrder: 'asc',
  cryptoCoin: '',
  cryptoMarketMode: '',
  cryptoTimeframe: '',
  sportsSport: '',
};

function useSportsEvents() {
  const { refreshWatchlistEventIds, toggleWatchlist, isInWatchlist } = useWatchlist();

  const filters = reactive({ ...DEFAULT_SPORTS_FILTERS });
  const metadata = ref<SportsMetadataItem[]>([]);
  const currentPage = ref(1);
  const pageEvents = ref<EventListItem[]>([]);
  const filteredCount = ref(0);
  const totalCount = ref(0);
  const activeCount = ref(0);
  const loading = ref(false);
  const metadataLoading = ref(false);
  const error = ref('');
  const metadataError = ref('');

  let ready = false;

  const availableSports = computed(() =>
    metadata.value.filter((item) => {
      const isEsport = item.tagIds.includes(ESPORTS_TAG_ID);
      return !isEsport;
    }),
  );

  const selectedSport = computed(() => filters.sportsSport || '');
  const selectedMetadata = computed(
    () => availableSports.value.find((item) => item.sport === selectedSport.value) ?? null,
  );
  const totalPages = computed(() => Math.max(1, Math.ceil(filteredCount.value / PAGE_SIZE)));
  const pageInfo = computed(() =>
    translateUiKey('page.indicator', { current: currentPage.value, total: totalPages.value }),
  );

  async function loadPersistedFilters(): Promise<void> {
    const saved = await window.api.loadFilters();
    if (!saved) return;

    const sortField = saved.sportsSortField || '';
    const sortOrder = saved.sportsSortOrder;
    filters.sortField = SPORTS_SORT_FIELDS.has(sortField)
      ? sortField
      : DEFAULT_SPORTS_FILTERS.sortField;
    filters.sortOrder = (sortOrder === 'desc' ? 'desc' : 'asc') as SortOrder;
    filters.search = saved.sportsSearch ?? '';
    filters.sportsSport = saved.sportsSport ?? '';
  }

  async function loadMetadata(): Promise<void> {
    metadataLoading.value = true;
    metadataError.value = '';
    try {
      metadata.value = await fetchSportsMetadataOnce();
      validateSelectedSport();
    } catch (err) {
      metadataError.value = err instanceof Error ? err.message : String(err);
    } finally {
      metadataLoading.value = false;
    }
  }

  function validateSelectedSport(): void {
    if (!selectedSport.value) return;
    const exists = availableSports.value.some((item) => item.sport === selectedSport.value);
    if (!exists) filters.sportsSport = '';
  }

  async function loadEvents(): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
      const params = {
        tagIds: resolveQueryTagIds(),
        excludeTagIds: resolveQueryExcludeTagIds(),
        search: filters.search,
        status: 'active' as const,
        sortField: filters.sortField,
        sortOrder: filters.sortOrder,
        limit: PAGE_SIZE,
        offset: (currentPage.value - 1) * PAGE_SIZE,
      };
      const [events, count] = await Promise.all([
        window.api.listEvents(params),
        window.api.countEvents(params),
      ]);
      pageEvents.value = events;
      filteredCount.value = count;
      totalCount.value = count;
      activeCount.value = count;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }

  function resolveQueryTagIds(): string[] {
    if (selectedMetadata.value?.tagIds.length) return [...selectedMetadata.value.tagIds];
    return [SPORTS_TAG_ID];
  }

  function resolveQueryExcludeTagIds(): string[] {
    if (selectedMetadata.value?.tagIds.length) return [];
    return [ESPORTS_TAG_ID];
  }

  function setSport(sport: string): void {
    if (selectedSport.value === sport) return;
    filters.sportsSport = sport;
  }

  function onFiltersChanged(): void {
    currentPage.value = 1;
    void loadEvents();
  }

  function setSortField(field: string): void {
    if (filters.sortField === field) {
      filters.sortOrder = filters.sortOrder === 'desc' ? 'asc' : 'desc';
    } else {
      filters.sortField = field;
      filters.sortOrder = field === 'title' || field === 'end_date' ? 'asc' : 'desc';
    }
    if (ready) {
      onFiltersChanged();
    }
  }

  function goPrevPage(): void {
    if (currentPage.value > 1) {
      currentPage.value--;
      void loadEvents();
    }
  }

  function goNextPage(): void {
    if (currentPage.value < totalPages.value) {
      currentPage.value++;
      void loadEvents();
    }
  }

  watch(
    () => selectedSport.value,
    () => {
      if (!ready) return;
      onFiltersChanged();
    },
  );

  watch(
    () => filters.search,
    () => {
      if (!ready) return;
      onFiltersChanged();
    },
  );

  watch(
    filters,
    () => {
      if (!ready) return;
      window.api.saveFilters({
        sportsSport: filters.sportsSport,
        sportsSearch: filters.search,
        sportsSortField: filters.sortField,
        sportsSortOrder: filters.sortOrder,
      });
    },
    { deep: true },
  );

  async function init(): Promise<void> {
    await loadPersistedFilters();
    await loadMetadata();
    ready = true;
    await refreshWatchlistEventIds();
    await loadEvents();
  }

  return {
    filters,
    metadata,
    availableSports,
    selectedSport,
    currentPage,
    pageEvents,
    filteredCount,
    totalCount,
    activeCount,
    loading,
    metadataLoading,
    error,
    metadataError,
    totalPages,
    pageInfo,
    init,
    loadEvents,
    setSport,
    setSortField,
    goPrevPage,
    goNextPage,
    toggleWatchlist,
    isInWatchlist,
  };
}

export { useSportsEvents };
