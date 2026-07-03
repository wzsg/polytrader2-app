import { TradingStrategyServiceImpl } from './tradingStrategyService.js';
import type {
  TradingStrategyService,
  TradingStrategyServiceOptions,
} from './tradingStrategyService.js';

class TradingStrategyFactory {
  private static _strategyService: TradingStrategyService | null = null;

  public static createTradingStrategyService(
    options: TradingStrategyServiceOptions,
  ): TradingStrategyService {
    if (!this._strategyService) {
      this._strategyService = new TradingStrategyServiceImpl(options);
    }
    return this._strategyService;
  }
}

function createTradingStrategyService(
  options: TradingStrategyServiceOptions,
): TradingStrategyService {
  return TradingStrategyFactory.createTradingStrategyService(options);
}

export { TradingStrategyFactory, createTradingStrategyService };
