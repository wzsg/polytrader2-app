import type { IpcMain } from 'electron';
import { PolymarketApiClient } from '@polytrader/polymarket-api';
import { MarketTradeRepositoryFactory } from '@polytrader/duckdb-repository';
import { polymarketMarketService } from '../services/polymarketMarketService.js';
import { wrap } from './result.js';
import type { MarketTradeAnalysisQuery, MarketTradeQuery } from '@polytrader/shared';

const apiClient = PolymarketApiClient.getInstance();

function resolveMarketTradeRepository(query: MarketTradeAnalysisQuery | MarketTradeQuery) {
  const marketId = String(query.marketId || '').trim();
  const conditionId = String(query.conditionId || '').trim();
  if (!marketId) throw new Error('marketId is required to access the trades DuckDB');
  if (!conditionId) throw new Error('conditionId is required to access the trades DuckDB');

  return {
    marketId,
    conditionId,
    repository: MarketTradeRepositoryFactory.getInstance().createMarketTradeRepository(
      marketId,
      conditionId,
    ),
  };
}

function registerMarketHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('api:fetchEvent', (_event, eventId: string) => apiClient.fetchEventById(eventId));
  ipcMain.handle('api:fetchCryptoCategory', () => polymarketMarketService.fetchCryptoCategory());
  ipcMain.handle('api:fetchEventCategory', () => polymarketMarketService.fetchEventCategory());
  ipcMain.handle('api:fetchSportsMetadata', () => polymarketMarketService.fetchSportsMetadata());
  ipcMain.handle('api:listCryptoEvents', (_event, params) =>
    polymarketMarketService.listCryptoEvents(params),
  );
  ipcMain.handle('api:listSportsEvents', (_event, params) =>
    polymarketMarketService.listSportsEvents(params),
  );
  ipcMain.handle(
    'api:fetchMarketDetail',
    wrap(polymarketMarketService.fetchMarketDetail.bind(polymarketMarketService)),
  );
  ipcMain.handle('api:fetchMarketTrades', wrap(apiClient.fetchMarketTrades.bind(apiClient)));
  ipcMain.handle(
    'api:startMarketTradeSync',
    wrap((marketId: string, conditionId: string) =>
      polymarketMarketService.startMarketTradeSync(marketId, conditionId),
    ),
  );
  ipcMain.handle(
    'api:listMarketTrades',
    wrap(async (query: MarketTradeQuery) => {
      const { marketId, conditionId, repository } = resolveMarketTradeRepository(query);
      return repository.listMarketTrades(
        query,
        await polymarketMarketService.getMarketTradeSyncStatus(marketId, conditionId),
      );
    }),
  );
  ipcMain.handle(
    'api:getMarketTradeAnalysis',
    wrap(async (query: MarketTradeAnalysisQuery) => {
      const { marketId, conditionId, repository } = resolveMarketTradeRepository(query);
      return repository.getMarketTradeAnalysis(
        query,
        await polymarketMarketService.getMarketTradeSyncStatus(marketId, conditionId),
      );
    }),
  );
  ipcMain.handle('api:fetchPriceHistory', wrap(apiClient.fetchPriceHistory.bind(apiClient)));
}

export { registerMarketHandlers };
