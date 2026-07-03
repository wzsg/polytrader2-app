import { POLYMARKET_CLOB_BASE_URL, type PriceHistoryPoint } from '@polytrader/shared';
import type { BatchPriceHistoryResponse, PriceHistoryResponse } from './types.js';

const PRICE_HISTORY_INTERVALS = new Set(['1h', '6h', '1d', '1w', '1m', 'max', 'all']);
const BATCH_PRICE_HISTORY_LIMIT = 20;

class PolymarketClobApiClient {
  private readonly _baseUrl: string;

  public constructor(baseUrl = POLYMARKET_CLOB_BASE_URL) {
    this._baseUrl = baseUrl;
  }

  public fetchOrderBooks(tokenIds: string[]): Promise<unknown[]> {
    return this.postTokenList('/books', tokenIds);
  }

  public fetchLastTradePrices(tokenIds: string[]): Promise<unknown[]> {
    return this.postTokenList('/last-trades-prices', tokenIds);
  }

  public async fetchPriceHistory(
    tokenId: string,
    interval = '1d',
    fidelity = 5,
  ): Promise<PriceHistoryPoint[]> {
    if (!tokenId) {
      throw new Error('tokenId is required to query price history');
    }

    const params = new URLSearchParams({
      market: tokenId,
      interval: this.normalizeInterval(interval),
      fidelity: String(this.normalizeFidelity(fidelity)),
    });

    const res = await fetch(`${this._baseUrl}/prices-history?${params}`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as PriceHistoryResponse;
    return this.normalizeHistory(data.history || []);
  }

  public async fetchBatchPriceHistory(
    tokenIds: string[],
    interval = '1d',
    fidelity = 5,
  ): Promise<Record<string, PriceHistoryPoint[]>> {
    const normalizedTokenIds = this.normalizeTokenIds(tokenIds);
    if (!normalizedTokenIds.length) return {};

    const result: Record<string, PriceHistoryPoint[]> = Object.fromEntries(
      normalizedTokenIds.map((tokenId) => [tokenId, []]),
    );

    for (let index = 0; index < normalizedTokenIds.length; index += BATCH_PRICE_HISTORY_LIMIT) {
      const chunk = normalizedTokenIds.slice(index, index + BATCH_PRICE_HISTORY_LIMIT);
      const res = await fetch(`${this._baseUrl}/batch-prices-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          markets: chunk,
          interval: this.normalizeInterval(interval),
          fidelity: this.normalizeFidelity(fidelity),
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }

      const data = (await res.json()) as BatchPriceHistoryResponse;
      for (const tokenId of chunk) {
        result[tokenId] = this.normalizeHistory(data.history?.[tokenId] || []);
      }
    }

    return result;
  }

  private normalizeHistory(
    history: NonNullable<PriceHistoryResponse['history']>,
  ): PriceHistoryPoint[] {
    return history
      .map((point) => ({
        t: this.normalizeEpochMs(point.t),
        p: Number(point.p),
      }))
      .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.p))
      .sort((a, b) => a.t - b.t);
  }

  private normalizeEpochMs(value: unknown): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return Number.NaN;
    return numeric > 1e12 ? numeric : numeric * 1000;
  }

  private normalizeFidelity(value: number): number {
    return Math.min(Math.max(Math.floor(Number(value)) || 5, 1), 1440);
  }

  private normalizeInterval(interval: string): string {
    return PRICE_HISTORY_INTERVALS.has(interval) ? interval : '1d';
  }

  private normalizeTokenIds(tokenIds: string[]): string[] {
    return [...new Set(tokenIds.map((tokenId) => String(tokenId || '').trim()).filter(Boolean))];
  }

  private async postTokenList(path: string, tokenIds: string[]): Promise<unknown[]> {
    if (!tokenIds.length) return [];

    const res = await fetch(`${this._baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tokenIds.map((token_id) => ({ token_id }))),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }

    return res.json() as Promise<unknown[]>;
  }
}

export { PolymarketClobApiClient };
