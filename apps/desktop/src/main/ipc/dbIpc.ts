import type { IpcMain } from 'electron';
import type { Filters, IpcRequest, ListEventsParams } from '@polytrader/shared';
import {
  createSqliteEventRepository,
  createSqliteWatchlistRepository,
} from '@polytrader/sqlite-repository';
import * as filtersStore from '../filters.js';
import { supabaseAuthService } from '../services/supabaseAuthService.js';
import { eventListCache, getEventListCacheTtlMs } from '../services/eventListCache.js';

const eventRepository = createSqliteEventRepository();
const watchlistRepository = createSqliteWatchlistRepository();

function registerDbHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('db:list', (_event, params: ListEventsParams) =>
    eventListCache.getOrSetValue(
      `events:list:${JSON.stringify(params)}`,
      getEventListCacheTtlMs(),
      async () => eventRepository.listEvents(params),
    ),
  );
  ipcMain.handle(
    'db:listChildren',
    async (_event, request: IpcRequest<{ parentEventId: string }>) => ({
      requestId: request.requestId,
      data: await eventRepository.listChildEvents(request.data.parentEventId),
    }),
  );
  ipcMain.handle(
    'db:listEventMarkets',
    async (_event, request: IpcRequest<{ eventId: string }>) => ({
      requestId: request.requestId,
      data: await eventRepository.listEventMarkets(request.data.eventId),
    }),
  );
  ipcMain.handle('db:count', (_event, params: ListEventsParams) =>
    eventListCache.getOrSetValue(
      `events:count:${JSON.stringify(params)}`,
      getEventListCacheTtlMs(),
      async () => eventRepository.countEvents(params),
    ),
  );
  ipcMain.handle('db:total', () =>
    eventListCache.getOrSetValue('events:total', getEventListCacheTtlMs(), async () =>
      eventRepository.getTotalCount(),
    ),
  );
  ipcMain.handle('db:countByTags', (_event, tagIds: string[]) =>
    eventRepository.countEventsWithTags(tagIds),
  );
  ipcMain.handle('db:countActiveByTags', (_event, tagIds: string[]) =>
    eventRepository.countActiveWithTags(tagIds),
  );
  ipcMain.handle('db:eventCacheStats', () => eventRepository.getEventCacheStats());
  ipcMain.handle('db:active', () =>
    eventListCache.getOrSetValue('events:active', getEventListCacheTtlMs(), async () =>
      eventRepository.countActive(),
    ),
  );
  ipcMain.handle('watchlist:list', () => watchlistRepository.getWatchlistEventIds());
  ipcMain.handle('watchlist:add', async (_event, eventId: string) => {
    const result = await watchlistRepository.addToWatchlist(eventId);
    if (result) supabaseAuthService.runDataSyncInBackground();
    return result;
  });
  ipcMain.handle('watchlist:remove', async (_event, eventId: string) => {
    await watchlistRepository.removeFromWatchlist(eventId);
    supabaseAuthService.runDataSyncInBackground();
  });
  ipcMain.handle('watchlist:count', () => watchlistRepository.countWatchlist());
  ipcMain.handle('watchlist:countOpen', () => watchlistRepository.countOpenWatchlistEvents());
  ipcMain.handle('filters:load', () => filtersStore.loadFilters());
  ipcMain.handle('filters:save', (_event, data: Partial<Filters>) =>
    filtersStore.saveFilters(data),
  );
}

export { registerDbHandlers };
