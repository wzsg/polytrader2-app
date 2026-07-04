import type { TradingRuntimeCryptoTickState } from '@polytrader/shared';

interface CryptoTickMarketWindow {
  startTime: string | null;
  endTime: string | null;
  displayStartTime: string | null;
  displayEndTime: string | null;
  closed: boolean;
}

interface TradingCryptoTickStartInput {
  marketId: string;
  symbol: string;
  window: CryptoTickMarketWindow;
}

interface TradingCryptoTickClientOptions {
  httpBaseUrl?: string;
  wsUrl?: string;
  historyLimit?: number;
  heartbeatMs?: number;
  reconnectDelayMs?: number;
}

interface TradingCryptoTickClient {
  start(input: TradingCryptoTickStartInput): void;
  snapshot(): TradingRuntimeCryptoTickState | null;
  dispose(): void;
  on(
    eventName: 'crypto-tick-changed',
    listener: (state: TradingRuntimeCryptoTickState) => void,
  ): unknown;
}

type TradingCryptoTickClientFactory = () => TradingCryptoTickClient;

export type {
  CryptoTickMarketWindow,
  TradingCryptoTickClient,
  TradingCryptoTickClientFactory,
  TradingCryptoTickClientOptions,
  TradingCryptoTickStartInput,
};
