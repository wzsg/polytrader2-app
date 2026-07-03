import { reactive, watch } from 'vue';
import type { EventStatusFilter, Filters, ListEventsParams, SortOrder } from '@polytrader/shared';

export const DEFAULT_FILTERS: Filters = {
  search: '',
  volume24hrMin: '',
  volume24hrMax: '',
  volumeMin: '',
  volumeMax: '',
  liquidityMin: '',
  liquidityMax: '',
  marketCountMin: '',
  marketCountMax: '',
  endDateMin: '',
  endDateMax: '',
  status: 'all',
  sortField: 'volume24hr',
  sortOrder: 'desc',
};

export const EVENT_LIST_DEFAULT_FILTERS: Filters = {
  ...DEFAULT_FILTERS,
  status: 'active',
};

export const WATCHLIST_DEFAULT_FILTERS: Filters = {
  ...DEFAULT_FILTERS,
  status: 'all',
};

const SORT_FIELDS = new Set([
  'volume24hr',
  'volume',
  'liquidity',
  'market_count',
  'title',
  'end_date',
  'active',
]);

const STATUS_FILTERS = new Set<EventStatusFilter>(['all', 'active', 'closed']);

type StatusPersistenceKey = 'eventStatus' | 'watchlistStatus';
type SortFieldPersistenceKey = 'eventSortField' | 'watchlistSortField';
type SortOrderPersistenceKey = 'eventSortOrder' | 'watchlistSortOrder';

interface SortPersistenceKeys {
  field: SortFieldPersistenceKey;
  order: SortOrderPersistenceKey;
  useLegacyFallback?: boolean;
}

interface UseFiltersOptions {
  defaultFilters?: Filters;
  statusPersistenceKey?: StatusPersistenceKey;
  sortPersistenceKeys?: SortPersistenceKeys;
}

function normalizedStatus(value: unknown, fallback: EventStatusFilter): EventStatusFilter {
  return STATUS_FILTERS.has(value as EventStatusFilter) ? (value as EventStatusFilter) : fallback;
}

export function useFilters({
  defaultFilters = DEFAULT_FILTERS,
  statusPersistenceKey,
  sortPersistenceKeys,
}: UseFiltersOptions = {}) {
  const filters = reactive<Filters>({ ...defaultFilters });
  const changeHandlers: Array<() => void> = [];
  let ready = false;

  function onFiltersChange(handler: () => void): void {
    changeHandlers.push(handler);
  }

  async function loadPersistedFilters(): Promise<void> {
    const saved = await window.api.loadFilters();
    if (saved) {
      const {
        cryptoCoin: _c,
        cryptoMarketMode: _m,
        cryptoTimeframe: _t,
        status: savedStatus,
        eventStatus: _eventStatus,
        watchlistStatus: _watchlistStatus,
        eventCategorySlug: _eventCategorySlug,
        sortField: legacySortField,
        sortOrder: legacySortOrder,
        eventSortField: _eventSortField,
        eventSortOrder: _eventSortOrder,
        watchlistSortField: _watchlistSortField,
        watchlistSortOrder: _watchlistSortOrder,
        cryptoSortField: _cryptoSortField,
        cryptoSortOrder: _cryptoSortOrder,
        ...eventSaved
      } = saved;
      const persistedSortField = sortPersistenceKeys
        ? (saved[sortPersistenceKeys.field] ??
          (sortPersistenceKeys.useLegacyFallback ? legacySortField : undefined))
        : legacySortField;
      const persistedSortOrder = sortPersistenceKeys
        ? (saved[sortPersistenceKeys.order] ??
          (sortPersistenceKeys.useLegacyFallback ? legacySortOrder : undefined))
        : legacySortOrder;
      Object.assign(filters, {
        ...defaultFilters,
        ...eventSaved,
        status: normalizedStatus(
          statusPersistenceKey ? saved[statusPersistenceKey] : savedStatus,
          defaultFilters.status,
        ),
        sortField:
          typeof persistedSortField === 'string' ? persistedSortField : defaultFilters.sortField,
        sortOrder:
          persistedSortOrder === 'asc' || persistedSortOrder === 'desc'
            ? persistedSortOrder
            : defaultFilters.sortOrder,
      });
      if (!SORT_FIELDS.has(filters.sortField)) {
        filters.sortField = defaultFilters.sortField;
      }
      if (filters.sortOrder !== 'asc' && filters.sortOrder !== 'desc') {
        filters.sortOrder = defaultFilters.sortOrder;
      }
    }
    ready = true;
  }

  function resetFilters(): void {
    Object.assign(filters, { ...defaultFilters });
  }

  function setSortField(field: string): void {
    if (filters.sortField === field) {
      filters.sortOrder = filters.sortOrder === 'desc' ? 'asc' : 'desc';
    } else {
      filters.sortField = field;
      filters.sortOrder = field === 'title' ? 'asc' : 'desc';
    }
  }

  watch(
    filters,
    () => {
      if (!ready) return;
      const data: Partial<Filters> = { ...filters };
      if (statusPersistenceKey) {
        data[statusPersistenceKey] = filters.status;
        delete data.status;
      }
      if (sortPersistenceKeys) {
        data[sortPersistenceKeys.field] = filters.sortField;
        data[sortPersistenceKeys.order] = filters.sortOrder as SortOrder;
        delete data.sortField;
        delete data.sortOrder;
      }
      window.api.saveFilters(data);
      changeHandlers.forEach((handler) => handler());
    },
    { deep: true },
  );

  return {
    filters,
    defaultFilters,
    loadPersistedFilters,
    resetFilters,
    setSortField,
    onFiltersChange,
  };
}

export function filtersToQuery(
  filters: Filters,
  {
    watchlistOnly,
    currentPage,
    pageSize,
  }: {
    watchlistOnly?: boolean;
    currentPage?: number;
    pageSize?: number;
  } = {},
): ListEventsParams {
  return {
    search: filters.search,
    volume24hrMin: filters.volume24hrMin,
    volume24hrMax: filters.volume24hrMax,
    volumeMin: filters.volumeMin,
    volumeMax: filters.volumeMax,
    liquidityMin: filters.liquidityMin,
    liquidityMax: filters.liquidityMax,
    marketCountMin: filters.marketCountMin,
    marketCountMax: filters.marketCountMax,
    endDateMin: filters.endDateMin,
    endDateMax: filters.endDateMax,
    status: filters.status as EventStatusFilter,
    watchlistOnly: !!watchlistOnly,
    sortField: filters.sortField,
    sortOrder: filters.sortOrder as SortOrder,
    limit: pageSize,
    offset: ((currentPage ?? 1) - 1) * (pageSize ?? 50),
  };
}
