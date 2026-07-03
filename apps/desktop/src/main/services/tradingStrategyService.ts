import { strategyRunHistoryService } from '@polytrader/strategy-runtime';
import { createTradingStrategyService } from '@polytrader/trading-strategy';

const tradingStrategyService = createTradingStrategyService({
  strategyHistory: {
    getActiveByMarket: (marketId) => strategyRunHistoryService.getActiveByMarket(marketId),
    listHistory: (options) => strategyRunHistoryService.listHistory(options),
    getLogs: (runId, limit) => strategyRunHistoryService.getLogs(runId, limit),
    getOrders: (runId, limit) => strategyRunHistoryService.getOrders(runId, limit),
    onRuntimeEvent: (callback) => {
      strategyRunHistoryService.on('runtime-event', callback);
      return () => strategyRunHistoryService.off('runtime-event', callback);
    },
  },
});

export { tradingStrategyService };
