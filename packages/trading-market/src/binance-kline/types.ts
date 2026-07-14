import type { BinanceKlineVenue, TradingRuntimeBinanceKlineState } from '@polytrader/shared';

interface BinanceKlineMarketWindow {
  startTime: string;
  endTime: string;
  closed: boolean;
}

interface TradingBinanceKlineStartInput {
  marketId: string;
  symbol: string;
  venue: BinanceKlineVenue;
  window: BinanceKlineMarketWindow;
}

interface TradingBinanceKlineClientOptions {
  spotHttpBaseUrl?: string;
  spotWsUrl?: string;
  futuresHttpBaseUrl?: string;
  futuresWsUrl?: string;
  reconnectDelayMs?: number;
  emitThrottleMs?: number;
  futuresPollMs?: number;
}

interface TradingBinanceKlineClient {
  start(input: TradingBinanceKlineStartInput): void;
  snapshot(): TradingRuntimeBinanceKlineState | null;
  dispose(): void;
  on(
    eventName: 'binance-kline-changed',
    listener: (state: TradingRuntimeBinanceKlineState) => void,
  ): unknown;
}

type TradingBinanceKlineClientFactory = () => TradingBinanceKlineClient;

export type {
  BinanceKlineMarketWindow,
  TradingBinanceKlineClient,
  TradingBinanceKlineClientFactory,
  TradingBinanceKlineClientOptions,
  TradingBinanceKlineStartInput,
};
