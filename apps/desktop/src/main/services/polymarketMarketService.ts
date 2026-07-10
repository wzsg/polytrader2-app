import { BrowserWindow } from 'electron';
import { PolymarketMarketService } from '@polytrader/polymarket-market';
import { PolymarketApiClient } from '@polytrader/polymarket-api';
import { MarketTradeRepositoryFactory } from '@polytrader/duckdb-repository';
import type { AppLocale } from '@polytrader/shared';
import {
  createSqliteEventRepository,
  createSqliteMetaRepository,
} from '@polytrader/sqlite-repository';
import { applicationEventBus } from './applicationEventBus.js';
import { appPreferencesService } from './appPreferencesService.js';
import { kvStore } from './kvStore.js';
import { desktopWorkflowService } from './workflowService.js';

const eventRepository = createSqliteEventRepository();
const metaRepository = createSqliteMetaRepository();

const polymarketMarketService = new PolymarketMarketService({
  apiClient: PolymarketApiClient.getInstance(),
  eventRepository,
  eventSyncWorkflowScheduler: desktopWorkflowService,
  metaRepository,
  marketTradeRepositoryFactory: (marketId, conditionId) =>
    MarketTradeRepositoryFactory.getInstance().createMarketTradeRepository(marketId, conditionId),
  cacheStore: kvStore,
  eventBus: applicationEventBus,
});

desktopWorkflowService.registerPolymarketEventSyncHandler((input, signal) =>
  polymarketMarketService.runEventSyncWorkflow(input, signal),
);

function broadcastCategoryConfigChanged(locale: AppLocale): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('category-config:changed', {
        locale,
        scopes: ['event', 'crypto', 'sports'],
      });
    }
  }
}

async function syncPolymarketMarketServicePreferences(): Promise<void> {
  const preferences = await appPreferencesService.getAppPreferences();
  polymarketMarketService.setEventSyncLocale(preferences.locale);
  polymarketMarketService.setCategoryConfigLocale(preferences.locale);
}

applicationEventBus.subscribe('app-preferences:changed', (event) => {
  if (!event.changedKeys.includes('localePreference')) return;
  if (event.preferences.locale === event.previousPreferences.locale) return;

  polymarketMarketService.setEventSyncLocale(event.preferences.locale);
  polymarketMarketService.setCategoryConfigLocale(event.preferences.locale);
  queueMicrotask(() => {
    broadcastCategoryConfigChanged(event.preferences.locale);
  });
  void polymarketMarketService
    .enqueueEventSync('locale-change', { replacePending: true })
    .catch((error) => {
      console.warn('Failed to enqueue locale event sync', error);
    });
});

applicationEventBus.subscribe('polymarket-event-sync:status', (event) => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('sync:status', event.status);
  }
});

polymarketMarketService.on('market-trade-sync-status', (status) => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('market-trades:updated', status);
  }
});

export { polymarketMarketService, syncPolymarketMarketServicePreferences };
