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
const CHAINLINK_TICK_TIMEFRAMES = new Set(['5m', '15m']);
const DISPLAY_PADDING_MS = 30_000;

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
  event: { endDate?: string | null; end_date?: string | null; closed?: boolean } | null;
  marketDetail: MarketDetailData | null;
  nowMs?: number;
}): TradingCryptoTickStartInput | null {
  const metadata = normalizeMetadata(input.metadata);
  if (!metadata) return null;
  if (metadata.source !== 'crypto') return null;
  if (metadata.crypto.mode !== 'up-down') return null;
  if (!CHAINLINK_TICK_TIMEFRAMES.has(metadata.crypto.timeframe)) return null;

  const symbol = CRYPTO_TICK_SYMBOL_BY_COIN[metadata.crypto.coin];
  if (!symbol) return null;

  return {
    marketId: input.marketId,
    symbol,
    window: resolveWindow(
      input.event,
      input.marketDetail,
      metadata.crypto.timeframe,
      input.nowMs ?? Date.now(),
    ),
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
  event: { endDate?: string | null; end_date?: string | null; closed?: boolean } | null,
  marketDetail: MarketDetailData | null,
  timeframe: string,
  nowMs: number,
): CryptoTickMarketWindow {
  const market = marketDetail?.market ?? null;
  const endTime = market?.endDate ?? event?.endDate ?? event?.end_date ?? null;
  const startTime = inferStartTime(endTime, timeframe);
  const displayStartTime = inferDisplayStartTime(startTime);
  const displayEndTime = inferDisplayEndTime(endTime);
  return {
    startTime,
    endTime,
    displayStartTime,
    displayEndTime,
    closed: isClosedByDisplayEndTime(displayEndTime, nowMs),
  };
}

function inferStartTime(endTime: string | null, timeframe: string): string | null {
  if (!endTime) return null;
  const endMs = Date.parse(endTime);
  if (!Number.isFinite(endMs)) return null;
  const durationMs = timeframeToDurationMs(timeframe);
  if (!durationMs) return null;
  return new Date(endMs - durationMs).toISOString();
}

function timeframeToDurationMs(timeframe: string): number | null {
  const match = /^(\d+)([mhd])$/.exec(timeframe.trim().toLowerCase());
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = match[2];
  if (unit === 'm') return amount * 60_000;
  if (unit === 'h') return amount * 60 * 60_000;
  return amount * 24 * 60 * 60_000;
}

function inferDisplayStartTime(startTime: string | null): string | null {
  const startMs = parseTime(startTime);
  return startMs ? new Date(startMs - DISPLAY_PADDING_MS).toISOString() : null;
}

function inferDisplayEndTime(endTime: string | null): string | null {
  const endMs = parseTime(endTime);
  return endMs ? new Date(endMs + DISPLAY_PADDING_MS).toISOString() : null;
}

function isClosedByDisplayEndTime(displayEndTime: string | null, nowMs: number): boolean {
  const displayEndMs = parseTime(displayEndTime);
  return Boolean(displayEndMs && displayEndMs <= nowMs);
}

function parseTime(value: string | null): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export { CRYPTO_TICK_SYMBOL_BY_COIN, resolveCryptoTickStartInput };
