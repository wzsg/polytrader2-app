import { BrowserWindow } from 'electron';
import { PolymarketMarketService } from '@polytrader/polymarket-market';
import { PolymarketApiClient } from '@polytrader/polymarket-api';
import { MarketTradeRepositoryFactory } from '@polytrader/duckdb-repository';
import {
  createSqliteEventRepository,
  createSqliteMetaRepository,
} from '@polytrader/sqlite-repository';
import { applicationEventBus } from './applicationEventBus.js';
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

applicationEventBus.subscribe('app-preferences:changed', (event) => {
  if (!event.changedKeys.includes('localePreference')) return;
  if (event.preferences.locale === event.previousPreferences.locale) return;

  polymarketMarketService.setEventSyncLocale(event.preferences.locale);
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

export { polymarketMarketService };
