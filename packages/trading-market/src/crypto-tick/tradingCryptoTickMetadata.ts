import type { MarketDetailData, TradingWindowInput } from '@polytrader/shared';
import type { CryptoTickMarketWindow, TradingCryptoTickStartInput } from './types.js';

const CRYPTO_TICK_SYMBOL_BY_COIN: Record<string, string> = {
  bitcoin: 'btcusd',
  ethereum: 'ethusd',
  solana: 'solusd',
  bnb: 'bnbusd',
  dogecoin: 'dogeusd',
  hyperliquid: 'hypeusd',
  xrp: 'xrpusd',
};

interface CryptoTradingMetadata {
  source?: unknown;
  crypto?: {
    coin?: unknown;
    mode?: unknown;
    timeframe?: unknown;
  };
}

function resolveCryptoTickStartInput(input: {
  marketId: string;
  metadata: TradingWindowInput['metadata'];
  event: { start_date?: string | null; end_date?: string | null; closed?: boolean } | null;
  marketDetail: MarketDetailData | null;
  nowMs?: number;
}): TradingCryptoTickStartInput | null {
  const metadata = normalizeMetadata(input.metadata);
  if (!metadata) return null;
  if (metadata.source !== 'crypto') return null;
  if (metadata.crypto.mode !== 'up-down' || metadata.crypto.timeframe !== '5m') return null;

  const symbol = CRYPTO_TICK_SYMBOL_BY_COIN[metadata.crypto.coin];
  if (!symbol) return null;

  return {
    marketId: input.marketId,
    symbol,
    window: resolveWindow(input.event, input.marketDetail, input.nowMs ?? Date.now()),
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

function resolveWindow(
  event: { start_date?: string | null; end_date?: string | null; closed?: boolean } | null,
  marketDetail: MarketDetailData | null,
  nowMs: number,
): CryptoTickMarketWindow {
  const market = marketDetail?.market ?? null;
  const endTime = market?.endDate ?? event?.end_date ?? null;
  const startTime = event?.start_date ?? inferStartTime(endTime);
  return {
    startTime,
    endTime,
    closed: Boolean(event?.closed || market?.closed || isClosedByEndTime(endTime, nowMs)),
  };
}

function inferStartTime(endTime: string | null): string | null {
  if (!endTime) return null;
  const endMs = Date.parse(endTime);
  if (!Number.isFinite(endMs)) return null;
  return new Date(endMs - 5 * 60_000).toISOString();
}

function isClosedByEndTime(endTime: string | null, nowMs: number): boolean {
  if (!endTime) return false;
  const endMs = Date.parse(endTime);
  return Number.isFinite(endMs) && endMs <= nowMs;
}

export { CRYPTO_TICK_SYMBOL_BY_COIN, resolveCryptoTickStartInput };
