import { computed, onScopeDispose, reactive, ref, watch } from 'vue';
import type { EventListItem, Filters, SortOrder } from '@polytrader/shared';
import type { SportDisciplineCategory } from '@polytrader/shared';
import { translateUiKey } from '../i18n';
import {
  clearSportsCategoryMetadataCache,
  fetchSportsCategoryConfigOnce,
} from './sportsMetadata';
import { useWatchlist } from './useWatchlist';

const PAGE_SIZE = 50;
const SPORTS_TAG_ID = '1';
const ESPORTS_TAG_ID = '64';

const SPORTS_SORT_FIELDS = new Set([
  'volume24hr',
  'volume',
  'liquidity',
  'title',
  'start_time',
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
  | 'sportsDiscipline'
  | 'sportsSport'
>;

const DEFAULT_SPORTS_FILTERS: SportsEventsFilters = {
  search: '',
  sortField: 'start_time',
  sortOrder: 'asc',
  cryptoCoin: '',
  cryptoMarketMode: '',
  cryptoTimeframe: '',
  sportsDiscipline: '',
  sportsSport: '',
};

function useSportsEvents() {
  const { refreshWatchlistEventIds, toggleWatchlist, isInWatchlist } = useWatchlist();

  const filters = reactive({ ...DEFAULT_SPORTS_FILTERS });
  const disciplines = ref<SportDisciplineCategory[]>([]);
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

  const unsubscribeCategoryConfigChanged = window.api.onCategoryConfigChanged((event) => {
    if (!event.scopes.includes('sports')) return;
    clearSportsCategoryMetadataCache();
    if (!ready) return;
    void loadMetadata().then(() => onFiltersChanged());
  });

  onScopeDispose(() => {
    unsubscribeCategoryConfigChanged();
  });

  const availableDisciplines = computed(() => disciplines.value);
  const selectedDiscipline = computed(() => filters.sportsDiscipline || '');
  const availableLeagues = computed(() => {
    if (!selectedDiscipline.value) return [];
    return (
      availableDisciplines.value.find((item) => item.code === selectedDiscipline.value)?.leagues ??
      []
    );
  });
  const selectedSport = computed(() => filters.sportsSport || '');
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
    filters.sportsDiscipline = saved.sportsDiscipline ?? '';
    filters.sportsSport = saved.sportsSport ?? '';
  }

  async function loadMetadata(): Promise<void> {
    metadataLoading.value = true;
    metadataError.value = '';
    try {
      const config = await fetchSportsCategoryConfigOnce();
      disciplines.value = config.disciplines;
      validateSelection();
    } catch (err) {
      metadataError.value = err instanceof Error ? err.message : String(err);
    } finally {
      metadataLoading.value = false;
    }
  }

  function validateSelection(): void {
    const discipline = selectedDiscipline.value
      ? availableDisciplines.value.find((item) => item.code === selectedDiscipline.value)
      : null;

    if (selectedDiscipline.value && !discipline) {
      filters.sportsDiscipline = '';
      filters.sportsSport = '';
      return;
    }

    if (!selectedSport.value) return;

    if (discipline) {
      const existsInDiscipline = discipline.leagues.some((league) => league.id === selectedSport.value);
      if (!existsInDiscipline) filters.sportsSport = '';
      return;
    }

    const owningDiscipline = availableDisciplines.value.find((item) =>
      item.leagues.some((league) => league.id === selectedSport.value),
    );
    if (owningDiscipline) {
      filters.sportsDiscipline = owningDiscipline.code;
      return;
    }

    filters.sportsSport = '';
  }

  async function loadEvents(): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
      const params = {
        sportId: selectedSport.value || undefined,
        sportIds: selectedSport.value ? undefined : selectedDisciplineSportIds(),
        requireSportId: selectedSport.value || selectedDiscipline.value ? undefined : true,
        tagIds: selectedSport.value || selectedDiscipline.value ? undefined : [SPORTS_TAG_ID],
        excludeTagIds:
          selectedSport.value || selectedDiscipline.value ? undefined : [ESPORTS_TAG_ID],
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

  function setSport(sport: string): void {
    if (selectedSport.value === sport) return;
    filters.sportsSport = sport;
  }

  function setDiscipline(discipline: string): void {
    if (selectedDiscipline.value === discipline) return;
    filters.sportsDiscipline = discipline;
    filters.sportsSport = '';
  }

  function selectedDisciplineSportIds(): string[] | undefined {
    if (!selectedDiscipline.value) return undefined;
    const ids = availableLeagues.value.map((league) => league.id).filter(Boolean);
    return ids.length ? ids : ['__none__'];
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
    () => [selectedDiscipline.value, selectedSport.value],
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
        sportsDiscipline: filters.sportsDiscipline,
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
    disciplines,
    availableDisciplines,
    availableLeagues,
    selectedDiscipline,
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
    setDiscipline,
    setSport,
    setSortField,
    goPrevPage,
    goNextPage,
    toggleWatchlist,
    isInWatchlist,
  };
}

export { useSportsEvents };
