import { reactive, ref, computed, watch } from 'vue';
import type { Filters, SortOrder } from '@polytrader/shared';
import type { EventListItem } from '@polytrader/shared';
import { translateUiKey } from '../i18n';
import {
  useCryptoCategory,
  validateSelection,
  resolveTagIds,
  resolveStartTimeMinutes,
} from './useCryptoCategory';
import { useWatchlist } from './useWatchlist';

const PAGE_SIZE = 50;

const CRYPTO_SORT_FIELDS = new Set([
  'volume24hr',
  'volume',
  'liquidity',
  'title',
  'start_date',
  'end_date',
  'active',
  'closed',
  'market_count',
]);

const DEFAULT_CRYPTO_FILTERS: Pick<
  Filters,
  'cryptoCoin' | 'cryptoMarketMode' | 'cryptoTimeframe' | 'sortField' | 'sortOrder'
> = {
  cryptoCoin: '',
  cryptoMarketMode: '',
  cryptoTimeframe: '',
  sortField: 'end_date',
  sortOrder: 'asc',
};

export function useCryptoEvents() {
  const cryptoCategory = useCryptoCategory();
  const { refreshWatchlistEventIds, toggleWatchlist, isInWatchlist } = useWatchlist();

  const filters = reactive({ ...DEFAULT_CRYPTO_FILTERS });
  const currentPage = ref(1);
  const pageEvents = ref<EventListItem[]>([]);
  const filteredCount = ref(0);
  const totalCount = ref(0);
  const activeCount = ref(0);
  const loading = ref(false);
  const error = ref('');

  let ready = false;

  const totalPages = computed(() => Math.max(1, Math.ceil(filteredCount.value / PAGE_SIZE)));
  const pageInfo = computed(() =>
    translateUiKey('page.indicator', { current: currentPage.value, total: totalPages.value }),
  );

  async function loadPersistedFilters(): Promise<void> {
    const saved = await window.api.loadFilters();
    if (saved) {
      Object.assign(filters, {
        cryptoCoin: saved.cryptoCoin ?? '',
        cryptoMarketMode: saved.cryptoMarketMode ?? '',
        cryptoTimeframe: saved.cryptoTimeframe ?? '',
        sortField: CRYPTO_SORT_FIELDS.has(saved.cryptoSortField || '')
          ? saved.cryptoSortField
          : DEFAULT_CRYPTO_FILTERS.sortField,
        sortOrder: (saved.cryptoSortOrder === 'asc' ? 'asc' : 'desc') as SortOrder,
      });
    }
  }

  function applyDefaultsToFilters(): void {
    if (!cryptoCategory.config.value) return;
    const selection = validateSelection(cryptoCategory.config.value, {
      coin: filters.cryptoCoin || '',
      mode: filters.cryptoMarketMode || '',
      timeframe: filters.cryptoTimeframe || '',
    });
    filters.cryptoCoin = selection.coin;
    filters.cryptoMarketMode = selection.mode;
    filters.cryptoTimeframe = selection.timeframe;
  }

  function getTagIds(): string[] {
    if (!cryptoCategory.config.value) return [];
    return resolveTagIds(
      cryptoCategory.config.value,
      filters.cryptoCoin || '',
      filters.cryptoMarketMode || '',
      filters.cryptoTimeframe || '',
    );
  }

  function getStartTimeMinutes(): number {
    if (!cryptoCategory.config.value) return 0;
    return resolveStartTimeMinutes(
      cryptoCategory.config.value,
      filters.cryptoCoin || '',
      filters.cryptoMarketMode || '',
      filters.cryptoTimeframe || '',
    );
  }

  async function loadEvents(): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
      const tagIds = getTagIds();
      if (!tagIds.length) {
        pageEvents.value = [];
        filteredCount.value = 0;
        totalCount.value = 0;
        activeCount.value = 0;
        return;
      }

      const result = await window.api.listCryptoEvents({
        tagIds,
        startTimeMinutes: getStartTimeMinutes(),
        sortField: filters.sortField,
        sortOrder: filters.sortOrder,
        limit: PAGE_SIZE,
        offset: (currentPage.value - 1) * PAGE_SIZE,
      });
      pageEvents.value = result.events;
      filteredCount.value = result.filteredCount;
      totalCount.value = result.totalCount;
      activeCount.value = result.activeCount;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
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
    () => ({
      cryptoCoin: filters.cryptoCoin,
      cryptoMarketMode: filters.cryptoMarketMode,
      cryptoTimeframe: filters.cryptoTimeframe,
    }),
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
        cryptoCoin: filters.cryptoCoin,
        cryptoMarketMode: filters.cryptoMarketMode,
        cryptoTimeframe: filters.cryptoTimeframe,
        cryptoSortField: filters.sortField,
        cryptoSortOrder: filters.sortOrder,
      });
    },
    { deep: true },
  );

  async function init(): Promise<void> {
    await loadPersistedFilters();
    await cryptoCategory.loadCategory();
    applyDefaultsToFilters();
    ready = true;
    await refreshWatchlistEventIds();
    await loadEvents();
  }

  return {
    cryptoCategory,
    filters,
    currentPage,
    pageEvents,
    filteredCount,
    totalCount,
    activeCount,
    loading,
    error,
    totalPages,
    pageInfo,
    init,
    loadEvents,
    setSortField,
    goPrevPage,
    goNextPage,
    toggleWatchlist,
    isInWatchlist,
  };
}
