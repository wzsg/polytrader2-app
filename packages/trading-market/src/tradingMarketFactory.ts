import { TradingMarketServiceImpl } from './tradingMarketService.js';
import type { TradingMarketService, TradingMarketServiceOptions } from './types.js';

class TradingMarketFactory {
  private static _marketService: TradingMarketService | null = null;

  public static createTradingMarketService(
    options: TradingMarketServiceOptions,
  ): TradingMarketService {
    if (!this._marketService) {
      this._marketService = new TradingMarketServiceImpl(options);
    }
    return this._marketService;
  }
}

function createTradingMarketService(options: TradingMarketServiceOptions): TradingMarketService {
  return TradingMarketFactory.createTradingMarketService(options);
}

export { TradingMarketFactory, createTradingMarketService };
