import {
  MarketPriceHistoryRepositoryFactory,
  MarketTradeRepositoryFactory,
} from '@polytrader/duckdb-repository';
import { PolymarketApiClient } from '@polytrader/polymarket-api';
import { createTradingMarketService } from '@polytrader/trading-market';
import { polymarketMarketService } from './polymarketMarketService.js';

const apiClient = PolymarketApiClient.getInstance();

const tradingMarketService = createTradingMarketService({
  apiClient: {
    fetchEventById: apiClient.fetchEventById.bind(apiClient),
    fetchMarketDetail: polymarketMarketService.fetchMarketDetail.bind(polymarketMarketService),
    streamPriceHistory: apiClient.streamPriceHistory.bind(apiClient),
  },
  marketTradeRepositoryFactory: {
    createMarketTradeRepository: (marketId, conditionId) =>
      MarketTradeRepositoryFactory.getInstance().createMarketTradeRepository(marketId, conditionId),
  },
  marketPriceHistoryRepositoryFactory: {
    createMarketPriceHistoryRepository: (marketId, conditionId) =>
      MarketPriceHistoryRepositoryFactory.getInstance().createMarketPriceHistoryRepository(
        marketId,
        conditionId,
      ),
  },
  marketTradeSync: {
    start: (marketId, conditionId) =>
      polymarketMarketService.startMarketTradeSync(marketId, conditionId),
    status: (marketId, conditionId) =>
      polymarketMarketService.getMarketTradeSyncStatus(marketId, conditionId),
    onStatus: (callback) => {
      polymarketMarketService.on('market-trade-sync-status', callback);
      return () => polymarketMarketService.off('market-trade-sync-status', callback);
    },
  },
});

export { tradingMarketService };
