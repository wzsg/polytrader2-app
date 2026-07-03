import type { Filters } from '@polytrader/shared';
import { kvStore } from './services/kvStore.js';

const FILTER_KEYS = [
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
  'eventStatus',
  'watchlistStatus',
  'eventCategorySlug',
  'sortField',
  'sortOrder',
  'eventSortField',
  'eventSortOrder',
  'watchlistSortField',
  'watchlistSortOrder',
  'cryptoSortField',
  'cryptoSortOrder',
  'cryptoCoin',
  'cryptoMarketMode',
  'cryptoTimeframe',
  'sportsSport',
  'sportsSortField',
  'sportsSortOrder',
  'esportsSport',
  'esportsSortField',
  'esportsSortOrder',
] as const;

const FILTERS_STORE_KEY = 'main-window-filters';

async function loadFilters(): Promise<Partial<Filters> | null> {
  const stored = await kvStore.getValue<Partial<Filters>>(FILTERS_STORE_KEY);
  return stored ? sanitizeFilters(stored) : null;
}

async function saveFilters(filters: Partial<Filters>): Promise<void> {
  const saved = (await loadFilters()) ?? {};
  const data = mergeFilters(saved, filters);
  await kvStore.setValue(FILTERS_STORE_KEY, data, null);
}

function sanitizeFilters(filters: Record<string, unknown>): Partial<Filters> | null {
  const out: Partial<Filters> = {};
  for (const key of FILTER_KEYS) {
    if (filters[key] !== undefined) {
      (out as Record<string, unknown>)[key] = filters[key];
    }
  }
  return Object.keys(out).length ? out : null;
}

function mergeFilters(saved: Partial<Filters>, filters: Partial<Filters>): Partial<Filters> {
  const data: Record<string, unknown> = {};
  for (const key of FILTER_KEYS) {
    const value = filters[key] !== undefined ? filters[key] : saved[key];
    if (value !== undefined) {
      data[key] = value;
    }
  }
  return data as Partial<Filters>;
}

export { FILTERS_STORE_KEY, FILTER_KEYS, loadFilters, saveFilters };
