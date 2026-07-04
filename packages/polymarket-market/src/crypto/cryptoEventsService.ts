import type {
  CryptoEventsResult,
  ListCryptoEventsParams,
  ListEventsParams,
} from '@polytrader/shared';
import type { EventRepository } from '@polytrader/repository-contract';

const CRYPTO_SORT_FIELDS = new Set([
  'volume24hr',
  'volume',
  'liquidity',
  'title',
  'start_date',
  'end_date',
  'active',
  'closed',
  'market_count',
]);

type CryptoEventsRepository = Pick<EventRepository, 'listEvents' | 'countEvents'>;

class CryptoEventsService {
  private readonly _repository: CryptoEventsRepository;

  public constructor(repository: CryptoEventsRepository) {
    this._repository = repository;
  }

  public async listCryptoEvents(params: ListCryptoEventsParams): Promise<CryptoEventsResult> {
    const tagIds = this.normalizeTagIds(params.tagIds);
    if (!tagIds.length) {
      return { events: [], filteredCount: 0, totalCount: 0, activeCount: 0 };
    }

    const localParams = this.buildLocalParams(params, tagIds);
    const [events, total] = await Promise.all([
      this._repository.listEvents(localParams),
      this._repository.countEvents(localParams),
    ]);
    const active =
      localParams.status === 'active'
        ? total
        : await this._repository.countEvents({ ...localParams, status: 'active' });

    return {
      events,
      filteredCount: total,
      totalCount: total,
      activeCount: active,
    };
  }

  private normalizeTagIds(tagIds: string[] | undefined): string[] {
    if (!Array.isArray(tagIds) || !tagIds.length) return [];
    return tagIds.map((id) => String(id)).filter(Boolean);
  }

  private resolveEndDateAfter(startTimeMinutes: number | undefined): string | undefined {
    const minutes = Number(startTimeMinutes);
    if (!Number.isInteger(minutes) || minutes <= 0) return undefined;
    return new Date(Date.now() - minutes * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  private buildLocalParams(params: ListCryptoEventsParams, tagIds: string[]): ListEventsParams {
    const limit = Math.max(1, Math.min(Number(params.limit) || 50, 500));
    const offset = Math.max(0, Number(params.offset) || 0);
    const sortFieldCandidate = params.sortField || '';
    const sortField = CRYPTO_SORT_FIELDS.has(sortFieldCandidate) ? sortFieldCandidate : 'end_date';

    return {
      tagIds,
      status: params.status ?? 'active',
      endDateMin: params.endDateMin,
      endDateMax: params.endDateMax,
      activeEndDateAfter: this.resolveEndDateAfter(Number(params.startTimeMinutes) || 0),
      sortField,
      sortOrder: params.sortOrder === 'desc' ? 'desc' : 'asc',
      limit,
      offset,
    };
  }
}

export { CryptoEventsService };
