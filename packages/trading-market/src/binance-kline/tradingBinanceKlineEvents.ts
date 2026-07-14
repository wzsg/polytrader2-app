import type { TradingRuntimeBinanceKlineState } from '@polytrader/shared';

interface TradingBinanceKlineEventMap {
  'binance-kline-changed': [state: TradingRuntimeBinanceKlineState];
}

export type { TradingBinanceKlineEventMap };
