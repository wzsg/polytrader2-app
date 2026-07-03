import type { IpcMain } from 'electron';
import type { Filters, ListEventsParams } from '@polytrader/shared';
import {
  createSqliteEventRepository,
  createSqliteWatchlistRepository,
} from '@polytrader/sqlite-repository';
import * as filtersStore from '../filters.js';
import { supabaseAuthService } from '../services/supabaseAuthService.js';

const eventRepository = createSqliteEventRepository();
const watchlistRepository = createSqliteWatchlistRepository();

function registerDbHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('db:list', (_event, params: ListEventsParams) =>
    eventRepository.listEvents(params),
  );
  ipcMain.handle('db:listChildren', (_event, parentEventId: string) =>
    eventRepository.listChildEvents(parentEventId),
  );
  ipcMain.handle('db:count', (_event, params: ListEventsParams) =>
    eventRepository.countEvents(params),
  );
  ipcMain.handle('db:total', () => eventRepository.getTotalCount());
  ipcMain.handle('db:countByTags', (_event, tagIds: string[]) =>
    eventRepository.countEventsWithTags(tagIds),
  );
  ipcMain.handle('db:countActiveByTags', (_event, tagIds: string[]) =>
    eventRepository.countActiveWithTags(tagIds),
  );
  ipcMain.handle('db:cacheStats', () => eventRepository.getCacheStats());
  ipcMain.handle('db:active', () => eventRepository.countActive());
  ipcMain.handle('watchlist:list', () => watchlistRepository.getWatchlistEventIds());
  ipcMain.handle('watchlist:add', async (_event, eventId: string) => {
    const result = await watchlistRepository.addToWatchlist(eventId);
    if (result) supabaseAuthService.syncLocalChangesInBackground();
    return result;
  });
  ipcMain.handle('watchlist:remove', async (_event, eventId: string) => {
    await watchlistRepository.removeFromWatchlist(eventId);
    supabaseAuthService.syncLocalChangesInBackground();
  });
  ipcMain.handle('watchlist:count', () => watchlistRepository.countWatchlist());
  ipcMain.handle('filters:load', () => filtersStore.loadFilters());
  ipcMain.handle('filters:save', (_event, data: Partial<Filters>) =>
    filtersStore.saveFilters(data),
  );
}

export { registerDbHandlers };
