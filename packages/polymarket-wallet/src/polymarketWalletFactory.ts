import { PolymarketWalletServiceImpl } from './polymarketWalletService.js';
import type { PolymarketWalletService, PolymarketWalletServiceOptions } from './types.js';

class PolymarketWalletFactory {
  private static _walletService: PolymarketWalletService | null = null;

  public static createPolymarketWalletService(
    options: PolymarketWalletServiceOptions,
  ): PolymarketWalletService {
    if (!this._walletService) {
      this._walletService = new PolymarketWalletServiceImpl(options);
    }
    return this._walletService;
  }
}

function createPolymarketWalletService(
  options: PolymarketWalletServiceOptions,
): PolymarketWalletService {
  return PolymarketWalletFactory.createPolymarketWalletService(options);
}

export { PolymarketWalletFactory, createPolymarketWalletService };
