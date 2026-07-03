import {
  POLYMARKET_DATA_API_BASE_URL,
  type DataPosition,
  type MarketTradeTick,
} from '@polytrader/shared';
import type { DataApiTrade } from './types.js';

const MAX_MARKET_TRADES_LIMIT = 500;

class PolymarketDataApiClient {
  private readonly _baseUrl: string;

  public constructor(baseUrl = POLYMARKET_DATA_API_BASE_URL) {
    this._baseUrl = baseUrl;
  }

  public async fetchPositionsByUser(user: string): Promise<DataPosition[]> {
    if (!user) {
      throw new Error(
        'This account is missing Deposit Wallet Address, so positions cannot be queried',
      );
    }

    const params = new URLSearchParams({
      user,
      limit: '500',
      sortBy: 'TOKENS',
      sortDirection: 'DESC',
    });

    const res = await fetch(`${this._baseUrl}/positions?${params}`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }

    return res.json() as Promise<DataPosition[]>;
  }

  public async fetchMarketHolders(conditionId: string, limit = 20): Promise<unknown[]> {
    if (!conditionId) {
      throw new Error('conditionId is required to query holders');
    }

    const params = new URLSearchParams({
      market: conditionId,
      limit: String(limit),
    });

    const res = await fetch(`${this._baseUrl}/holders?${params}`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }

    return res.json() as Promise<unknown[]>;
  }

  public async fetchMarketTrades(
    conditionId: string,
    limit = 200,
    offset = 0,
  ): Promise<MarketTradeTick[]> {
    if (!conditionId) {
      throw new Error('conditionId is required to query market trades');
    }

    const params = new URLSearchParams({
      market: conditionId,
      limit: String(this.normalizeLimit(limit)),
      offset: String(Math.max(0, Math.trunc(Number(offset) || 0))),
    });

    const res = await fetch(`${this._baseUrl}/trades?${params}`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as DataApiTrade[];
    if (!Array.isArray(data)) return [];
    return data.map((trade) => this.normalizeMarketTrade(trade));
  }

  private normalizeLimit(limit: number): number {
    const parsedLimit = Number.isFinite(limit) ? Math.floor(limit) : 200;
    return Math.min(Math.max(parsedLimit, 1), MAX_MARKET_TRADES_LIMIT);
  }

  private normalizeMarketTrade(trade: DataApiTrade): MarketTradeTick {
    const tokenId = String(trade.asset ?? trade.tokenId ?? '');
    const explicitId = trade.id ?? trade.tradeId;
    const idParts = [
      explicitId,
      trade.transactionHash,
      tokenId,
      trade.timestamp,
      trade.side,
      trade.price,
      trade.size,
    ].filter((part) => part != null && part !== '');

    return {
      id: idParts.join(':'),
      tokenId,
      outcome: trade.outcome,
      side: trade.side,
      price: trade.price,
      priceRaw: trade.price,
      size: trade.size,
      timestamp: trade.timestamp,
      transactionHash: trade.transactionHash,
      source: 'history',
    };
  }
}

export { PolymarketDataApiClient };
