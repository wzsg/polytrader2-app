import type {
  ListEventsParams,
  ListSportsEventsParams,
  SportsEventsResult,
  SportsMetadataItem,
  SportsMetadataRaw,
} from '@polytrader/shared';
import type { EventRepository } from '@polytrader/repository-contract';
import type { MarketServiceCacheStore } from '../types.js';

const SPORTS_METADATA_STORE_KEY = 'sports-metadata-visible-v1';
const SPORTS_METADATA_TTL_MS = 60 * 60 * 1000;
const SPORTS_TAG_ID = '1';
const ESPORTS_TAG_ID = '64';
const SPORTS_START_TIME_GRACE_MS = 24 * 60 * 60 * 1000;

const SPORTS_SORT_FIELDS = new Set([
  'volume24hr',
  'volume',
  'liquidity',
  'title',
  'start_time',
  'active',
  'closed',
  'market_count',
]);

interface SportsEventsClient {
  fetchSportsMetadata(): Promise<SportsMetadataRaw[]>;
}

type SportsEventsRepository = Pick<
  EventRepository,
  'listEvents' | 'countEvents' | 'countActiveEventsByTagSets'
>;

interface SportsEventsServiceOptions {
  apiClient: SportsEventsClient;
  repository: SportsEventsRepository;
  cacheStore: MarketServiceCacheStore;
  metadataTtlMs?: number;
}

class SportsEventsService {
  private readonly _apiClient: SportsEventsClient;
  private readonly _repository: SportsEventsRepository;
  private readonly _cacheStore: MarketServiceCacheStore;
  private readonly _metadataTtlMs: number;

  public constructor(options: SportsEventsServiceOptions) {
    this._apiClient = options.apiClient;
    this._repository = options.repository;
    this._cacheStore = options.cacheStore;
    this._metadataTtlMs = options.metadataTtlMs ?? SPORTS_METADATA_TTL_MS;
  }

  public fetchSportsMetadata(): Promise<SportsMetadataItem[]> {
    return this._cacheStore.getOrSetValue<SportsMetadataItem[]>(
      SPORTS_METADATA_STORE_KEY,
      this._metadataTtlMs,
      () => this._loadSportsMetadata(),
    );
  }

  public async listSportsEvents(params: ListSportsEventsParams): Promise<SportsEventsResult> {
    const localParams = this._buildLocalParams(params);
    const [events, total] = await Promise.all([
      this._repository.listEvents(localParams),
      this._repository.countEvents(localParams),
    ]);

    return {
      events,
      filteredCount: total,
      totalCount: total,
      activeCount: total,
    };
  }

  private async _loadSportsMetadata(): Promise<SportsMetadataItem[]> {
    const rawItems = await this._apiClient.fetchSportsMetadata();
    const items = rawItems
      .map((item) => this._mapMetadataItem(item))
      .filter((item) => item.sport && item.tagIds.length);
    const countResults = await this._repository.countActiveEventsByTagSets(
      items.map((item) => ({
        key: this._metadataKey(item),
        tagIds: item.tagIds,
      })),
    );
    const counts = new Map(countResults.map((result) => [result.key, result.count]));

    return items
      .map((item) => ({
        ...item,
        activeEventCount: counts.get(this._metadataKey(item)) ?? 0,
      }))
      .filter((item) => (item.activeEventCount ?? 0) > 0);
  }

  private _mapMetadataItem(item: SportsMetadataRaw): SportsMetadataItem {
    return {
      id: item.id,
      sport: String(item.sport || '').trim(),
      image: String(item.image || '').trim(),
      resolution: String(item.resolution || '').trim(),
      ordering: String(item.ordering || '').trim(),
      tagIds: this._normalizeTagIds(this._splitTagIds(item.tags)),
      series: String(item.series || '').trim(),
      createdAt: item.createdAt,
    };
  }

  private _splitTagIds(tags: string): string[] {
    return String(tags || '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  private _metadataKey(item: Pick<SportsMetadataItem, 'sport' | 'series'>): string {
    return `${item.sport}:${item.series}`;
  }

  private _resolveTagIds(params: ListSportsEventsParams): string[] {
    const normalized = this._normalizeTagIds(params.tagIds);
    if (normalized.length) return normalized;
    return params.scope === 'esports' ? [SPORTS_TAG_ID, ESPORTS_TAG_ID] : [SPORTS_TAG_ID];
  }

  private _resolveExcludeTagIds(params: ListSportsEventsParams): string[] {
    const normalized = this._normalizeTagIds(params.excludeTagIds);
    if (normalized.length) return normalized;
    return params.scope === 'sports' && !this._normalizeTagIds(params.tagIds).length
      ? [ESPORTS_TAG_ID]
      : [];
  }

  private _normalizeTagIds(tagIds: string[] | undefined): string[] {
    if (!Array.isArray(tagIds) || !tagIds.length) return [];
    return Array.from(new Set(tagIds.map((id) => String(id).trim()).filter(Boolean)));
  }

  private _buildLocalParams(params: ListSportsEventsParams): ListEventsParams {
    const limit = Math.max(1, Math.min(Number(params.limit) || 50, 500));
    const offset = Math.max(0, Number(params.offset) || 0);
    const sortFieldCandidate = params.sortField || '';
    const sortField = SPORTS_SORT_FIELDS.has(sortFieldCandidate) ? sortFieldCandidate : 'start_time';
    const sportId = String(params.sportId || '').trim();

    return {
      sportId: sportId || undefined,
      requireSportId: params.scope === 'sports' && !sportId,
      excludeEnded: params.scope === 'sports',
      startTimeAfter:
        params.scope === 'sports'
          ? new Date(Date.now() - SPORTS_START_TIME_GRACE_MS).toISOString()
          : undefined,
      tagIds: sportId ? undefined : this._resolveTagIds(params),
      excludeTagIds: sportId ? undefined : this._resolveExcludeTagIds(params),
      status: 'active',
      sortField,
      sortOrder: params.sortOrder === 'desc' ? 'desc' : 'asc',
      limit,
      offset,
    };
  }
}

export { SportsEventsService };
export type { SportsEventsServiceOptions };
