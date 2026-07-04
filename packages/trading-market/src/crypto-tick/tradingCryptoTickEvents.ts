import type { TradingRuntimeCryptoTickState } from '@polytrader/shared';

interface TradingCryptoTickEventMap {
  'crypto-tick-changed': [state: TradingRuntimeCryptoTickState];
}

export type { TradingCryptoTickEventMap };
