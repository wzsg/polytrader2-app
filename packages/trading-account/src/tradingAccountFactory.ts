import { TradingAccountServiceImpl } from './tradingAccountService.js';
import type { TradingAccountService } from './types.js';
import type { TradingAccountServiceOptions } from './tradingAccountService.js';

class TradingAccountFactory {
  private static _accountService: TradingAccountService | null = null;

  public static createTradingAccountService(
    options: TradingAccountServiceOptions,
  ): TradingAccountService {
    if (!this._accountService) {
      this._accountService = new TradingAccountServiceImpl(options);
    }
    return this._accountService;
  }
}

function createTradingAccountService(options: TradingAccountServiceOptions): TradingAccountService {
  return TradingAccountFactory.createTradingAccountService(options);
}

export { TradingAccountFactory, createTradingAccountService };
