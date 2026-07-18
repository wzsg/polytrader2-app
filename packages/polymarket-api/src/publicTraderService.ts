import type {
  PublicTraderLeaderboardEntry,
  PublicTraderLeaderboardQuery,
  PublicTraderLeaderboardResult,
  PublicTraderListQuery,
  PublicTraderPosition,
  PublicTraderPositionListResult,
  PublicTraderProfile,
  PublicTraderTrade,
  PublicTraderTradeListResult,
} from '@polytrader/shared';
import type { PolymarketApiClient } from './polymarketApiClient.js';

const MAX_LEADERBOARD_LIMIT = 50;
const MAX_POSITION_LIMIT = 500;
const MAX_TRADE_LIMIT = 100;

class PublicTraderService {
  private readonly _apiClient: PolymarketApiClient;

  public constructor(apiClient: PolymarketApiClient) {
    this._apiClient = apiClient;
  }

  public async getLeaderboard(
    query: PublicTraderLeaderboardQuery,
  ): Promise<PublicTraderLeaderboardResult> {
    const normalized = this._normalizeLeaderboardQuery(query);
    const entries = await this._apiClient.fetchPublicTraderLeaderboard(normalized);
    return {
      entries: entries
        .map((entry) => this._normalizeLeaderboardEntry(entry))
        .filter((entry): entry is PublicTraderLeaderboardEntry => entry !== null),
      limit: normalized.limit,
      offset: normalized.offset,
    };
  }

  public async getProfile(address: string): Promise<PublicTraderProfile> {
    const normalizedAddress = this._normalizeAddress(address);
    const [profileResult, valueResult, tradedResult] = await Promise.allSettled([
      this._apiClient.fetchPublicTraderProfile(normalizedAddress),
      this._apiClient.fetchPublicTraderPositionValue(normalizedAddress),
      this._apiClient.fetchPublicTraderTradedMarkets(normalizedAddress),
    ]);
    const profile = profileResult.status === 'fulfilled' ? profileResult.value : null;
    return this._normalizeProfile(
      profile,
      normalizedAddress,
      valueResult.status === 'fulfilled' ? valueResult.value : null,
      tradedResult.status === 'fulfilled' ? tradedResult.value : null,
    );
  }

  public async listPositions(
    query: PublicTraderListQuery,
  ): Promise<PublicTraderPositionListResult> {
    const normalized = this._normalizeListQuery(query, MAX_POSITION_LIMIT);
    const positions = await this._apiClient.fetchPublicTraderPositions(normalized);
    return {
      entries: positions
        .map((position) => this._normalizePosition(position))
        .filter((position): position is PublicTraderPosition => position !== null),
      limit: normalized.limit,
      offset: normalized.offset,
    };
  }

  public async listTrades(query: PublicTraderListQuery): Promise<PublicTraderTradeListResult> {
    const normalized = this._normalizeListQuery(query, MAX_TRADE_LIMIT);
    const trades = await this._apiClient.fetchPublicTraderTrades(normalized);
    return {
      entries: trades
        .map((trade) => this._normalizeTrade(trade))
        .filter((trade): trade is PublicTraderTrade => trade !== null),
      limit: normalized.limit,
      offset: normalized.offset,
    };
  }

  private _normalizeLeaderboardQuery(
    query: PublicTraderLeaderboardQuery,
  ): Required<PublicTraderLeaderboardQuery> {
    return {
      timePeriod: this._normalizeEnum(query.timePeriod, ['DAY', 'WEEK', 'MONTH', 'ALL'], 'MONTH'),
      category: this._normalizeEnum(
        query.category,
        [
          'OVERALL',
          'POLITICS',
          'SPORTS',
          'CRYPTO',
          'CULTURE',
          'MENTIONS',
          'WEATHER',
          'ECONOMICS',
          'TECH',
          'FINANCE',
        ],
        'OVERALL',
      ),
      orderBy: this._normalizeEnum(query.orderBy, ['PNL', 'VOL'], 'PNL'),
      limit: this._clampInteger(query.limit, MAX_LEADERBOARD_LIMIT, 1, MAX_LEADERBOARD_LIMIT),
      offset: this._clampInteger(query.offset, 0, 0, 1000),
    };
  }

  private _normalizeListQuery(
    query: PublicTraderListQuery,
    maximumLimit: number,
  ): Required<PublicTraderListQuery> {
    return {
      address: this._normalizeAddress(query.address),
      limit: this._clampInteger(query.limit, MAX_TRADE_LIMIT, 1, maximumLimit),
      offset: this._clampInteger(query.offset, 0, 0, 10000),
    };
  }

  private _normalizeLeaderboardEntry(input: unknown): PublicTraderLeaderboardEntry | null {
    const row = this._asRecord(input);
    const proxyWallet = this._stringFrom(row?.proxyWallet);
    if (!this._isAddress(proxyWallet)) return null;
    return {
      rank: this._stringFrom(row?.rank),
      proxyWallet,
      userName: this._stringFrom(row?.userName) || proxyWallet,
      volume: this._numberFrom(row?.vol),
      pnl: this._numberFrom(row?.pnl),
      profileImage: this._nullableStringFrom(row?.profileImage),
      xUsername: this._nullableStringFrom(row?.xUsername),
      verifiedBadge: this._booleanFrom(row?.verifiedBadge),
    };
  }

  private _normalizeProfile(
    input: unknown,
    address: string,
    valueInput: unknown,
    tradedInput: unknown,
  ): PublicTraderProfile {
    const row = this._asRecord(input);
    return {
      address: this._stringFrom(row?.proxyWallet) || address,
      name: this._nullableStringFrom(row?.name),
      pseudonym: this._nullableStringFrom(row?.pseudonym),
      bio: this._nullableStringFrom(row?.bio),
      profileImage: this._nullableStringFrom(row?.profileImage),
      xUsername: this._nullableStringFrom(row?.xUsername),
      verifiedBadge: this._booleanFrom(row?.verifiedBadge),
      totalPositionValue: this._valueFrom(valueInput, 'value'),
      tradedMarkets: this._valueFrom(tradedInput, 'traded'),
    };
  }

  private _normalizePosition(input: unknown): PublicTraderPosition | null {
    const row = this._asRecord(input);
    const asset = this._stringFrom(row?.asset);
    const conditionId = this._stringFrom(row?.conditionId);
    if (!asset || !conditionId) return null;
    return {
      asset,
      conditionId,
      title: this._stringFrom(row?.title) || conditionId,
      icon: this._nullableStringFrom(row?.icon),
      outcome: this._stringFrom(row?.outcome) || '—',
      size: this._numberFrom(row?.size),
      avgPrice: this._numberFrom(row?.avgPrice),
      currentPrice: this._numberFrom(row?.curPrice),
      initialValue: this._numberFrom(row?.initialValue),
      currentValue: this._numberFrom(row?.currentValue),
      cashPnl: this._numberFrom(row?.cashPnl),
      percentPnl: this._numberFrom(row?.percentPnl),
    };
  }

  private _normalizeTrade(input: unknown): PublicTraderTrade | null {
    const row = this._asRecord(input);
    const asset = this._stringFrom(row?.asset);
    const conditionId = this._stringFrom(row?.conditionId);
    if (!asset || !conditionId) return null;
    return {
      asset,
      conditionId,
      side: this._stringFrom(row?.side).toUpperCase() === 'SELL' ? 'SELL' : 'BUY',
      title: this._stringFrom(row?.title) || conditionId,
      icon: this._nullableStringFrom(row?.icon),
      outcome: this._stringFrom(row?.outcome) || '—',
      size: this._numberFrom(row?.size),
      price: this._numberFrom(row?.price),
      timestamp: this._numberFrom(row?.timestamp),
      transactionHash:
        this._nullableStringFrom(row?.transactionHash) ?? this._nullableStringFrom(row?.txHash),
    };
  }

  private _normalizeAddress(address: string): string {
    const normalized = address.trim();
    if (!this._isAddress(normalized)) throw new Error('A valid public trader address is required');
    return normalized;
  }

  private _normalizeEnum<T extends string>(value: T | undefined, values: T[], fallback: T): T {
    return values.includes(value ?? fallback) ? (value ?? fallback) : fallback;
  }

  private _clampInteger(
    value: number | undefined,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, Math.trunc(number)));
  }

  private _asRecord(input: unknown): Record<string, unknown> | null {
    return typeof input === 'object' && input !== null && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : null;
  }

  private _stringFrom(input: unknown): string {
    if (typeof input === 'string') return input.trim();
    if (typeof input === 'number' && Number.isFinite(input)) return String(input);
    return '';
  }

  private _nullableStringFrom(input: unknown): string | null {
    return this._stringFrom(input) || null;
  }

  private _numberFrom(input: unknown): number {
    const number = typeof input === 'number' ? input : Number(input);
    return Number.isFinite(number) ? number : 0;
  }

  private _booleanFrom(input: unknown): boolean {
    return input === true || String(input).toLowerCase() === 'true';
  }

  private _valueFrom(input: unknown, key: string): number | null {
    const row = Array.isArray(input) ? this._asRecord(input[0]) : this._asRecord(input);
    if (!row || !(key in row)) return null;
    return this._numberFrom(row[key]);
  }

  private _isAddress(value: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(value);
  }
}

export { PublicTraderService };
