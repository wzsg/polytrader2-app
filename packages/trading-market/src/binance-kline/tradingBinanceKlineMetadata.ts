import type { BinanceKlineVenue, MarketDetailData, TradingWindowInput } from '@polytrader/shared';
import type { TradingBinanceKlineStartInput } from './types.js';

interface BinanceMarketDefinition {
  symbol: string;
  venue: BinanceKlineVenue;
}

interface CryptoTradingMetadata {
  source?: unknown;
  crypto?: {
    coin?: unknown;
    mode?: unknown;
    timeframe?: unknown;
  };
}

const BINANCE_MARKET_BY_COIN: Record<string, BinanceMarketDefinition> = {
  bitcoin: { symbol: 'BTCUSDT', venue: 'spot' },
  ethereum: { symbol: 'ETHUSDT', venue: 'spot' },
  solana: { symbol: 'SOLUSDT', venue: 'spot' },
  xrp: { symbol: 'XRPUSDT', venue: 'spot' },
  dogecoin: { symbol: 'DOGEUSDT', venue: 'spot' },
  bnb: { symbol: 'BNBUSDT', venue: 'spot' },
  hyperliquid: { symbol: 'HYPEUSDT', venue: 'usdm-futures' },
};
const ONE_HOUR_MS = 60 * 60_000;

function resolveBinanceKlineStartInput(input: {
  marketId: string;
  metadata: TradingWindowInput['metadata'];
  event: {
    endDate?: string | null;
    end_date?: string | null;
    closed?: boolean;
  } | null;
  marketDetail: MarketDetailData | null;
  nowMs?: number;
}): TradingBinanceKlineStartInput | null {
  const metadata = normalizeMetadata(input.metadata);
  if (!metadata) return null;
  if (metadata.source !== 'crypto') return null;
  if (metadata.crypto.mode !== 'up-down') return null;
  if (metadata.crypto.timeframe !== '1h') return null;

  const market = BINANCE_MARKET_BY_COIN[metadata.crypto.coin];
  if (!market) return null;

  const endTime =
    input.marketDetail?.market.endDate ?? input.event?.endDate ?? input.event?.end_date;
  const endMs = endTime ? Date.parse(endTime) : Number.NaN;
  if (!Number.isFinite(endMs)) return null;
  const startMs = endMs - ONE_HOUR_MS;
  const nowMs = input.nowMs ?? Date.now();

  return {
    marketId: input.marketId,
    symbol: market.symbol,
    venue: market.venue,
    window: {
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(endMs).toISOString(),
      closed: Boolean(input.event?.closed) || endMs <= nowMs,
    },
  };
}

function normalizeMetadata(metadata: unknown): {
  source: string;
  crypto: { coin: string; mode: string; timeframe: string };
} | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = metadata as CryptoTradingMetadata;
  if (!raw.crypto || typeof raw.crypto !== 'object') return null;
  return {
    source: String(raw.source || ''),
    crypto: {
      coin: String(raw.crypto.coin || ''),
      mode: String(raw.crypto.mode || ''),
      timeframe: String(raw.crypto.timeframe || ''),
    },
  };
}

export { BINANCE_MARKET_BY_COIN, resolveBinanceKlineStartInput };
export type { BinanceMarketDefinition };
