import { MemoryCacheStore } from '@polytrader/cache-store';
import { applicationEventBus } from './applicationEventBus.js';
import { fileCacheStore } from './fileCacheStore.js';

const DEFAULT_EVENT_LIST_CACHE_TTL_MS = 10 * 60 * 1000;
const SPORTS_METADATA_STORE_KEY = 'sports-metadata-visible-v1';

const eventListCache = new MemoryCacheStore({ maxEntries: 128 });
let eventListCacheTtlMs = DEFAULT_EVENT_LIST_CACHE_TTL_MS;

function getEventListCacheTtlMs(): number {
  return eventListCacheTtlMs;
}

function setEventListCacheIntervalMinutes(intervalMinutes: number): void {
  const minutes = Number(intervalMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return;
  eventListCacheTtlMs = Math.trunc(minutes * 60 * 1000);
}

function clearEventListCache(): void {
  eventListCache.clear();
}

applicationEventBus.subscribe('polymarket-event-sync:status', (event) => {
  if (
    event.status.state === 'syncing' ||
    event.status.state === 'done' ||
    event.status.state === 'aborted' ||
    event.status.state === 'error'
  ) {
    clearEventListCache();
    void fileCacheStore.deleteValue(SPORTS_METADATA_STORE_KEY).catch((error) => {
      console.warn('Failed to invalidate sports metadata cache', error);
    });
  }
});

export {
  clearEventListCache,
  eventListCache,
  getEventListCacheTtlMs,
  setEventListCacheIntervalMinutes,
};
