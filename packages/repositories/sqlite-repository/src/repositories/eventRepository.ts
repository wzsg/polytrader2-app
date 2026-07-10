import type {
  EventBulkUpsertStats,
  EventTagSetCountInput,
  EventTagSetCountResult,
} from '@polytrader/repository-contract';
import type {
  AppLocale,
  DbMarket,
  EventListItem,
  GammaEventRaw,
  ListEventsParams,
} from '@polytrader/shared';
import { countOpenMarkets } from '@polytrader/shared';
import { and, asc, count, eq, isNull, or } from 'drizzle-orm';
import { getDb, getSqlite } from '../client.js';
import { eventTags, events, markets } from '../schema/index.js';
import { SqliteMetaRepository } from './metaRepository.js';

interface EventRow {
  id: string;
  locale: string;
  title: string;
  slug: string;
  image: string;
  volume: number;
  volume24hr: number;
  liquidity: number;
  active: number;
  closed: number;
  market_count: number;
  start_date: string | null;
  start_time: string | null;
  end_date: string | null;
  category: string;
  sport_id: string | null;
  featured: number;
  parent_event_id: string | null;
  teams: string | null;
  updated_at: string | null;
}

interface MarketRow {
  id: string;
  locale: string;
  event_id: string;
  question: string;
  slug: string;
  group_item_title: string;
  condition_id: string | null;
  image: string;
  icon: string;
  active: number;
  closed: number;
  negative_risk: number;
  outcomes: string | null;
  outcome_prices: string | null;
  clob_token_ids: string | null;
  clob_token_ids_0: string | null;
  clob_token_ids_1: string | null;
  outcomes_0: string | null;
  outcomes_1: string | null;
  outcome_prices_0: string | null;
  outcome_prices_1: string | null;
  volume: number;
  volume24hr: number;
  liquidity: number;
  updated_at: string | null;
}

interface EventWhereClause {
  where: string;
  values: Record<string, unknown>;
}

class SqliteEventRepository {
  private readonly _sortFields = new Set([
    'title',
    'volume24hr',
    'volume',
    'liquidity',
    'market_count',
    'start_date',
    'start_time',
    'end_date',
    'active',
    'closed',
  ]);

  public bulkUpsert(rawEvents: GammaEventRaw[], locale: AppLocale): EventBulkUpsertStats {
    const stats = this._createBulkUpsertStats(rawEvents.length);
    if (!rawEvents.length) return stats;

    const db = getDb();

    db.transaction((tx) => {
      for (const event of rawEvents) {
        if (!this._hasRequiredEventMarkets(event)) {
          stats.eventsSkipped++;
          continue;
        }

        const eventRow = this._formatEventRow(event, locale);
        const marketRows = (event.markets || [])
          .filter((market) => market.id != null)
          .map((market) => this._formatMarketRow(market, eventRow.id, locale));
        if (this._isEventSnapshotCurrent(eventRow, marketRows)) {
          stats.eventsSkipped++;
          continue;
        }

        tx.insert(events)
          .values(eventRow)
          .onConflictDoUpdate({
            target: events.id,
            set: {
              title: eventRow.title,
              locale: eventRow.locale,
              slug: eventRow.slug,
              image: eventRow.image,
              volume: eventRow.volume,
              volume24hr: eventRow.volume24hr,
              liquidity: eventRow.liquidity,
              active: eventRow.active,
              closed: eventRow.closed,
              marketCount: eventRow.marketCount,
              startDate: eventRow.startDate,
              startTime: eventRow.startTime,
              endDate: eventRow.endDate,
              category: eventRow.category,
              sportId: eventRow.sportId,
              featured: eventRow.featured,
              parentEventId: eventRow.parentEventId,
              teams: eventRow.teams,
              updatedAt: eventRow.updatedAt,
            },
          })
          .run();
        stats.eventsUpserted++;

        tx.delete(markets).where(eq(markets.eventId, eventRow.id)).run();
        for (const marketRow of marketRows) {
          tx.insert(markets).values(marketRow).run();
          stats.marketsUpserted++;
        }

        tx.delete(eventTags).where(eq(eventTags.eventId, eventRow.id)).run();
        for (const tag of event.tags || []) {
          if (tag.id == null) continue;
          tx.insert(eventTags)
            .values({
              eventId: eventRow.id,
              tagId: String(tag.id),
              label: tag.label || '',
              slug: tag.slug || '',
            })
            .run();
          stats.tagsUpserted++;
        }
      }
    });

    return stats;
  }

  public markOpenEventsMissingFromSnapshotClosed(seenEventIds: string[]): number {
    const normalizedIds = [...new Set(seenEventIds.map((id) => String(id || '')).filter(Boolean))];
    if (!normalizedIds.length) return 0;

    const sqlite = getSqlite();
    let closedCount = 0;
    const closeMissingEvents = sqlite.transaction((ids: string[]) => {
      sqlite.exec(`
        CREATE TEMP TABLE IF NOT EXISTS event_sync_seen_events (
          id TEXT PRIMARY KEY
        );
        CREATE TEMP TABLE IF NOT EXISTS event_sync_closed_events (
          id TEXT PRIMARY KEY
        );
        DELETE FROM event_sync_seen_events;
        DELETE FROM event_sync_closed_events;
      `);

      const insertSeen = sqlite.prepare(
        'INSERT OR IGNORE INTO event_sync_seen_events (id) VALUES (?)',
      );
      for (const id of ids) insertSeen.run(id);

      sqlite.exec(`
        INSERT OR IGNORE INTO event_sync_closed_events (id)
        SELECT id FROM events
        WHERE closed = 0
        AND NOT EXISTS (
          SELECT 1 FROM event_sync_seen_events seen
          WHERE seen.id = events.id
        );
      `);

      closedCount = (
        sqlite.prepare('SELECT COUNT(*) AS count FROM event_sync_closed_events').get() as {
          count: number;
        }
      ).count;

      sqlite.exec(`
        UPDATE events
        SET closed = 1
        WHERE id IN (SELECT id FROM event_sync_closed_events);

        UPDATE markets
        SET closed = 1
        WHERE event_id IN (SELECT id FROM event_sync_closed_events);

        DELETE FROM event_sync_seen_events;
        DELETE FROM event_sync_closed_events;
      `);
    });

    closeMissingEvents(normalizedIds);
    return closedCount;
  }

  public listEvents(params: ListEventsParams): EventListItem[] {
    const sqlite = getSqlite();
    const withAlias = this._usesEventAlias(params);
    const { where, values } = this._buildWhere(params);
    const prefixedWhere = this._prefixWhereForJoin(where, withAlias);
    const orderBy = this._buildOrderBy(params.sortField, params.sortOrder, withAlias);
    const limit = Math.max(1, Math.min(Number(params.limit) || 50, 500));
    const offset = Math.max(0, Number(params.offset) || 0);

    const query = `
      SELECT e.* FROM ${this._eventsFromClause(params.watchlistOnly === true)}
      ${prefixedWhere}
      ${orderBy}
      LIMIT @limit OFFSET @offset
    `;

    const rows = sqlite.prepare(query).all({ ...values, limit, offset }) as EventRow[];
    return this._attachMarkets(rows.map((row) => this._rowToEvent(row)));
  }

  public countEvents(params: ListEventsParams): number {
    const sqlite = getSqlite();
    const withAlias = this._usesEventAlias(params);
    const { where, values } = this._buildWhere(params);
    const prefixedWhere = this._prefixWhereForJoin(where, withAlias);
    const query = `SELECT COUNT(*) AS cnt FROM ${this._eventsFromClause(
      params.watchlistOnly === true,
    )} ${prefixedWhere}`;
    const row = sqlite.prepare(query).get(values) as { cnt: number };
    return row.cnt;
  }

  public listChildEvents(parentEventId: string): EventListItem[] {
    const id = String(parentEventId || '').trim();
    if (!id) return [];

    const rows = getSqlite()
      .prepare(
        `
        SELECT * FROM events
        WHERE parent_event_id = @parentEventId
        ORDER BY volume24hr DESC
        `,
      )
      .all({ parentEventId: id }) as EventRow[];
    return this._attachMarkets(rows.map((row) => this._rowToEvent(row)));
  }

  public countEventsWithTags(tagIds: string[]): number {
    return this.countEvents({ tagIds: this._normalizeTagIds(tagIds) });
  }

  public countActiveWithTags(tagIds: string[]): number {
    return this.countEvents({ tagIds: this._normalizeTagIds(tagIds), status: 'active' });
  }

  public countActiveEventsByTagSets(tagSets: EventTagSetCountInput[]): EventTagSetCountResult[] {
    const normalized = tagSets
      .map((tagSet) => ({
        key: String(tagSet.key || '').trim(),
        tagIds: this._normalizeTagIds(tagSet.tagIds),
      }))
      .filter((tagSet) => tagSet.key && tagSet.tagIds.length);

    if (!normalized.length) return [];

    const sqlite = getSqlite();
    sqlite.exec(`
      CREATE TEMP TABLE IF NOT EXISTS event_tag_set_filter (
        set_key TEXT NOT NULL,
        tag_id TEXT NOT NULL
      );
      DELETE FROM event_tag_set_filter;
    `);

    const insert = sqlite.prepare(
      'INSERT INTO event_tag_set_filter (set_key, tag_id) VALUES (@setKey, @tagId)',
    );
    const insertMany = sqlite.transaction((items: typeof normalized) => {
      for (const item of items) {
        for (const tagId of item.tagIds) {
          insert.run({ setKey: item.key, tagId });
        }
      }
    });
    insertMany(normalized);

    const rows = sqlite
      .prepare(
        `
        WITH required AS (
          SELECT set_key, COUNT(DISTINCT tag_id) AS tag_count
          FROM event_tag_set_filter
          GROUP BY set_key
        ),
        matched AS (
          SELECT f.set_key, et.event_id
          FROM event_tag_set_filter f
          JOIN event_tags et ON et.tag_id = f.tag_id
          JOIN events e ON e.id = et.event_id
          WHERE e.active = 1 AND e.closed = 0 AND e.parent_event_id IS NULL
          GROUP BY f.set_key, et.event_id
          HAVING COUNT(DISTINCT et.tag_id) = (
            SELECT tag_count FROM required WHERE required.set_key = f.set_key
          )
        )
        SELECT required.set_key AS key, COUNT(matched.event_id) AS count
        FROM required
        LEFT JOIN matched ON matched.set_key = required.set_key
        GROUP BY required.set_key
        `,
      )
      .all() as EventTagSetCountResult[];

    sqlite.exec('DELETE FROM event_tag_set_filter;');
    return rows;
  }

  public getTotalCount(): number {
    return this._countRootEvents();
  }

  public countActive(): number {
    const db = getDb();
    const row = db
      .select({ cnt: count() })
      .from(events)
      .where(and(eq(events.active, true), eq(events.closed, false), isNull(events.parentEventId)))
      .get();
    return row?.cnt ?? 0;
  }

  public listOpenEventIds(): string[] {
    const db = getDb();
    return db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.closed, false))
      .orderBy(asc(events.id))
      .all()
      .map((row) => String(row.id));
  }

  public countMarkets(): number {
    const db = getDb();
    const row = db.select({ cnt: count() }).from(markets).get();
    return row?.cnt ?? 0;
  }

  public getMarketByClobTokenId(assetId: string): DbMarket | null {
    const normalizedAssetId = assetId.trim();
    if (!normalizedAssetId) return null;
    const rows = getDb()
      .select()
      .from(markets)
      .where(
        or(
          eq(markets.clobTokenIds0, normalizedAssetId),
          eq(markets.clobTokenIds1, normalizedAssetId),
        ),
      )
      .limit(2)
      .all();
    if (rows.length > 1) throw new Error(`assetId matches multiple markets: ${normalizedAssetId}`);
    return rows[0] ? this._rowToMarket(this._drizzleMarketToRow(rows[0])) : null;
  }

  public getMarketByConditionId(conditionId: string): DbMarket | null {
    const normalizedConditionId = conditionId.trim();
    if (!normalizedConditionId) return null;
    const row =
      getDb()
        .select()
        .from(markets)
        .where(eq(markets.conditionId, normalizedConditionId))
        .limit(1)
        .get() || null;
    return row ? this._rowToMarket(this._drizzleMarketToRow(row)) : null;
  }

  public getCacheStats(): { eventCount: number; marketCount: number; lastSyncAt: string | null } {
    return {
      eventCount: this._countAllEvents(),
      marketCount: this.countMarkets(),
      lastSyncAt: new SqliteMetaRepository().getLastSyncTime(),
    };
  }

  private _countAllEvents(): number {
    const row = getDb().select({ cnt: count() }).from(events).get();
    return row?.cnt ?? 0;
  }

  private _createBulkUpsertStats(received: number): EventBulkUpsertStats {
    return {
      received,
      eventsUpserted: 0,
      eventsSkipped: 0,
      marketsUpserted: 0,
      tagsUpserted: 0,
    };
  }

  private _countRootEvents(): number {
    const row = getDb()
      .select({ cnt: count() })
      .from(events)
      .where(isNull(events.parentEventId))
      .get();
    return row?.cnt ?? 0;
  }

  private _formatEventRow(event: GammaEventRaw, locale: AppLocale) {
    const eventMarkets = event.markets || [];
    const parentEventId = event.parentEventId == null ? null : String(event.parentEventId);
    const sportId = event.sportId ?? event.sport?.id ?? null;
    return {
      id: String(event.id),
      locale,
      title: event.title || '',
      slug: event.slug || '',
      image: event.image || event.icon || '',
      volume: Number(event.volume) || 0,
      volume24hr: Number(event.volume24hr) || 0,
      liquidity: Number(event.liquidity) || 0,
      active: event.active !== false,
      closed: event.closed === true,
      marketCount: countOpenMarkets(eventMarkets),
      startDate: event.startDate || null,
      startTime: event.startTime || null,
      endDate: event.endDate || null,
      category: event.category || '',
      sportId: sportId == null ? null : String(sportId),
      featured: event.featured === true,
      parentEventId,
      teams: this._formatTeams(event.teams),
      updatedAt: event.updatedAt || null,
    };
  }

  private _isEventSnapshotCurrent(
    eventRow: ReturnType<SqliteEventRepository['_formatEventRow']>,
    marketRows: Array<ReturnType<SqliteEventRepository['_formatMarketRow']>>,
  ): boolean {
    if (!eventRow.updatedAt) return false;

    const sqlite = getSqlite();
    const existingEvent = sqlite
      .prepare('SELECT locale, updated_at, parent_event_id, sport_id, start_time, teams FROM events WHERE id = ?')
      .get(eventRow.id) as
      | {
          locale: string | null;
          updated_at: string | null;
          parent_event_id: string | null;
          sport_id: string | null;
          start_time: string | null;
          teams: string | null;
        }
      | undefined;
    if (!existingEvent || existingEvent.updated_at !== eventRow.updatedAt) return false;
    if (existingEvent.locale !== eventRow.locale) return false;
    if (existingEvent.parent_event_id !== eventRow.parentEventId) return false;
    if (existingEvent.sport_id !== eventRow.sportId) return false;
    if (existingEvent.start_time !== eventRow.startTime) return false;
    if (existingEvent.teams !== eventRow.teams) return false;

    const existingMarkets = sqlite
      .prepare(
        'SELECT id, locale, updated_at, volume, volume24hr, liquidity, negative_risk FROM markets WHERE event_id = ?',
      )
      .all(eventRow.id) as Array<{
      id: string;
      locale: string | null;
      updated_at: string | null;
      volume: number | null;
      volume24hr: number | null;
      liquidity: number | null;
      negative_risk: number | null;
    }>;
    if (existingMarkets.length !== marketRows.length) return false;

    const existingMarketUpdates = new Map(existingMarkets.map((market) => [market.id, market]));
    for (const market of marketRows) {
      if (!market.updatedAt) return false;
      const existingMarket = existingMarketUpdates.get(market.id);
      if (!existingMarket) return false;
      if (existingMarket.locale !== market.locale) return false;
      if (existingMarket.updated_at !== market.updatedAt) return false;
      if ((Number(existingMarket.volume) || 0) !== market.volume) return false;
      if ((Number(existingMarket.volume24hr) || 0) !== market.volume24hr) return false;
      if ((Number(existingMarket.liquidity) || 0) !== market.liquidity) return false;
      if ((existingMarket.negative_risk === 1) !== market.negRisk) return false;
    }

    return true;
  }

  private _parseJsonPair(value: unknown): [unknown, unknown] | null {
    if (value == null) return null;
    const parsed = typeof value === 'string' ? this._parseJsonString(value) : value;
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    return [parsed[0], parsed[1]];
  }

  private _parseJsonString(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  private _formatJsonPair(value: unknown): {
    raw: string | null;
    first: string | null;
    second: string | null;
  } {
    const pair = this._parseJsonPair(value);
    if (!pair) return { raw: null, first: null, second: null };
    return {
      raw: JSON.stringify(pair),
      first: this._formatJsonPairItem(pair[0]),
      second: this._formatJsonPairItem(pair[1]),
    };
  }

  private _formatJsonPairItem(value: unknown): string | null {
    if (value == null) return null;
    return String(value);
  }

  private _formatTeams(value: unknown): string | null {
    if (!Array.isArray(value)) return null;
    const teams = value
      .map((item) => this._formatTeam(item))
      .filter((item): item is NonNullable<ReturnType<SqliteEventRepository['_formatTeam']>> =>
        Boolean(item),
      );
    return teams.length ? JSON.stringify(teams) : null;
  }

  private _formatTeam(value: unknown): {
    name: string;
    logo: string;
    abbreviation?: string;
    ordering?: string;
    color?: string;
  } | null {
    if (!value || typeof value !== 'object') return null;
    const row = value as Record<string, unknown>;
    const name = String(row.name || '').trim();
    const logo = String(row.logo || '').trim();
    if (!name || !logo) return null;
    const team: {
      name: string;
      logo: string;
      abbreviation?: string;
      ordering?: string;
      color?: string;
    } = { name, logo };
    if (row.abbreviation) team.abbreviation = String(row.abbreviation);
    if (row.ordering) team.ordering = String(row.ordering);
    if (row.color) team.color = String(row.color);
    return team;
  }

  private _formatMarketRow(
    market: NonNullable<GammaEventRaw['markets']>[number],
    eventId: string,
    locale: AppLocale,
  ) {
    const clobTokenIds = this._formatJsonPair(market.clobTokenIds);
    const outcomes = this._formatJsonPair(market.outcomes);
    const outcomePrices = this._formatJsonPair(market.outcomePrices);

    return {
      id: String(market.id),
      locale,
      eventId: String(eventId),
      question: market.question || '',
      slug: market.slug || '',
      groupItemTitle: market.groupItemTitle || '',
      conditionId: market.conditionId || null,
      image: market.image || '',
      icon: market.icon || '',
      active: market.active === true,
      closed: market.closed === true,
      negRisk: this._requireMarketNegRisk(market),
      outcomes: outcomes.raw,
      outcomePrices: outcomePrices.raw,
      clobTokenIds: clobTokenIds.raw,
      clobTokenIds0: clobTokenIds.first,
      clobTokenIds1: clobTokenIds.second,
      outcomes0: outcomes.first,
      outcomes1: outcomes.second,
      outcomePrices0: outcomePrices.first,
      outcomePrices1: outcomePrices.second,
      volume: Number(market.volumeNum ?? market.volume) || 0,
      volume24hr: Number(market.volume24hr) || 0,
      liquidity: Number(market.liquidityNum ?? market.liquidity) || 0,
      updatedAt: market.updatedAt || null,
    };
  }

  private _requireMarketNegRisk(market: NonNullable<GammaEventRaw['markets']>[number]): boolean {
    if (typeof market.negRisk === 'boolean') return market.negRisk;
    throw new Error(`Market snapshot is missing boolean negRisk: ${String(market.id || '')}`);
  }

  private _hasRequiredEventMarkets(event: GammaEventRaw): boolean {
    for (const market of event.markets || []) {
      if (market.id == null || this._hasOwnProperty(market, 'negRisk')) continue;
      console.warn(
        `Skipping event snapshot with market missing boolean negRisk: event=${String(
          event.id || '',
        )} market=${String(market.id || '')}`,
      );
      return false;
    }
    return true;
  }

  private _hasOwnProperty(value: object, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  private _normalizeTagIds(tagIds: string[] | undefined): string[] {
    if (!Array.isArray(tagIds) || !tagIds.length) return [];
    return tagIds.map((id) => String(id)).filter(Boolean);
  }

  private _usesEventAlias(params: ListEventsParams): boolean {
    return (
      params.watchlistOnly === true ||
      this._normalizeTagIds(params.tagIds).length > 0 ||
      this._normalizeTagIds(params.excludeTagIds).length > 0
    );
  }

  private _parseDateFilter(value: unknown): string | null {
    if (!value || typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
    const d = new Date(`${trimmed}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return null;
    return trimmed;
  }

  private _parseDateTimeFilter(value: unknown): string | null {
    if (!value || typeof value !== 'string') return null;
    const trimmed = value.trim();
    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  private _buildWhere(params: ListEventsParams): EventWhereClause {
    const clauses: string[] = [];
    const values: Record<string, unknown> = {};

    if (params.search) {
      clauses.push('(title LIKE @search OR slug LIKE @search)');
      values.search = `%${params.search}%`;
    }

    this._addNumberRangeClause(clauses, values, params.volume24hrMin, 'volume24hr', '>=');
    this._addNumberRangeClause(clauses, values, params.volume24hrMax, 'volume24hr', '<=');
    this._addNumberRangeClause(clauses, values, params.volumeMin, 'volume', '>=');
    this._addNumberRangeClause(clauses, values, params.volumeMax, 'volume', '<=');
    this._addNumberRangeClause(clauses, values, params.liquidityMin, 'liquidity', '>=');
    this._addNumberRangeClause(clauses, values, params.liquidityMax, 'liquidity', '<=');
    this._addNumberRangeClause(clauses, values, params.marketCountMin, 'market_count', '>=');
    this._addNumberRangeClause(clauses, values, params.marketCountMax, 'market_count', '<=');

    const endDateMin = this._parseDateFilter(params.endDateMin);
    if (endDateMin) {
      clauses.push('end_date IS NOT NULL AND date(end_date) >= @endDateMin');
      values.endDateMin = endDateMin;
    }

    const endDateMax = this._parseDateFilter(params.endDateMax);
    if (endDateMax) {
      clauses.push('end_date IS NOT NULL AND date(end_date) <= @endDateMax');
      values.endDateMax = endDateMax;
    }

    const endDateAfter = this._parseDateTimeFilter(params.endDateAfter);
    if (endDateAfter) {
      clauses.push('end_date IS NOT NULL AND datetime(end_date) >= datetime(@endDateAfter)');
      values.endDateAfter = endDateAfter;
    }

    const activeEndDateAfter = this._parseDateTimeFilter(params.activeEndDateAfter);
    if (activeEndDateAfter) {
      clauses.push(
        '(NOT (active = 1 AND closed = 0) OR (end_date IS NOT NULL AND datetime(end_date) >= datetime(@activeEndDateAfter)))',
      );
      values.activeEndDateAfter = activeEndDateAfter;
    }

    if (params.status === 'active') {
      clauses.push('active = 1 AND closed = 0');
    } else if (params.status === 'closed') {
      clauses.push('closed = 1');
    }

    if (params.sportId) {
      clauses.push('sport_id = @sportId');
      values.sportId = String(params.sportId);
    } else if (params.sportIds?.length) {
      const sportIds = params.sportIds.map((id) => String(id).trim()).filter(Boolean);
      if (sportIds.length) {
        clauses.push(`sport_id IN (${sportIds.map((_, index) => `@sportId${index}`).join(', ')})`);
        sportIds.forEach((id, index) => {
          values[`sportId${index}`] = id;
        });
      }
    } else if (params.requireSportId === true) {
      clauses.push("sport_id IS NOT NULL AND sport_id != ''");
    }

    if (params.includeChildEvents !== true) {
      clauses.push('parent_event_id IS NULL');
    }

    this._appendIncludedTagClauses(params, clauses, values);
    this._appendExcludedTagClauses(params, clauses, values);

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return { where, values };
  }

  private _addNumberRangeClause(
    clauses: string[],
    values: Record<string, unknown>,
    value: unknown,
    field: string,
    operator: '>=' | '<=',
  ): void {
    if (value === '' || value == null) return;
    const numberValue = Number(value);
    if (Number.isNaN(numberValue)) return;
    const valueKey = this._fieldValueKey(field, operator);
    clauses.push(`${field} ${operator} @${valueKey}`);
    values[valueKey] = numberValue;
  }

  private _fieldValueKey(field: string, operator: '>=' | '<='): string {
    const key = field.replace(/_([a-z])/g, (_match, char: string) => char.toUpperCase());
    return `${key}${operator === '>=' ? 'Min' : 'Max'}`;
  }

  private _appendIncludedTagClauses(
    params: ListEventsParams,
    clauses: string[],
    values: Record<string, unknown>,
  ): void {
    const tagIds = Array.from(new Set(this._normalizeTagIds(params.tagIds)));
    if (tagIds.length === 0) return;

    tagIds.forEach((id, i) => {
      values[`tag${i}`] = id;
    });

    clauses.push(
      tagIds
        .map(
          (_id, i) => `EXISTS (
      SELECT 1 FROM event_tags included_tags_${i}
      WHERE included_tags_${i}.event_id = e.id
      AND included_tags_${i}.tag_id = @tag${i}
    )`,
        )
        .join(' AND '),
    );
  }

  private _appendExcludedTagClauses(
    params: ListEventsParams,
    clauses: string[],
    values: Record<string, unknown>,
  ): void {
    const excludeTagIds = this._normalizeTagIds(params.excludeTagIds);
    if (excludeTagIds.length === 0) return;
    const placeholders = excludeTagIds.map((_id, i) => `@excludeTag${i}`).join(', ');
    excludeTagIds.forEach((id, i) => {
      values[`excludeTag${i}`] = id;
    });
    clauses.push(`NOT EXISTS (
      SELECT 1 FROM event_tags excluded_tags
      WHERE excluded_tags.event_id = e.id
      AND excluded_tags.tag_id IN (${placeholders})
    )`);
  }

  private _buildOrderBy(
    sortField: string | undefined,
    sortOrder: string | undefined,
    withAlias: boolean,
  ): string {
    const field = this._sortFields.has(sortField || '') ? sortField! : 'volume24hr';
    const dir = sortOrder === 'asc' ? 'ASC' : 'DESC';
    const col = withAlias ? `e.${field}` : field;

    if (field === 'title') {
      return `ORDER BY ${col} COLLATE NOCASE ${dir}`;
    }
    if (field === 'start_time') {
      return `ORDER BY ${col} IS NULL ASC, ${col} ${dir}`;
    }
    return `ORDER BY ${col} ${dir}`;
  }

  private _rowToEvent(row: EventRow): EventListItem {
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      image: row.image,
      volume: row.volume,
      volume24hr: row.volume24hr,
      liquidity: row.liquidity,
      active: row.active === 1,
      closed: row.closed === 1,
      market_count: row.market_count,
      start_date: row.start_date,
      start_time: row.start_time,
      end_date: row.end_date,
      category: row.category,
      sportId: row.sport_id,
      featured: row.featured === 1,
      parentEventId: row.parent_event_id,
      teams: row.teams,
      markets: [],
    };
  }

  private _rowToMarket(row: MarketRow): DbMarket {
    return {
      id: row.id,
      question: row.question,
      slug: row.slug,
      groupItemTitle: row.group_item_title,
      conditionId: row.condition_id,
      image: row.image,
      icon: row.icon,
      active: row.active === 1,
      closed: row.closed === 1,
      negRisk: row.negative_risk === 1,
      outcomes: row.outcomes,
      outcomePrices: row.outcome_prices,
      clobTokenIds: row.clob_token_ids,
      clobTokenIds0: row.clob_token_ids_0,
      clobTokenIds1: row.clob_token_ids_1,
      outcomes0: row.outcomes_0,
      outcomes1: row.outcomes_1,
      outcomePrices0: row.outcome_prices_0,
      outcomePrices1: row.outcome_prices_1,
      volume: Number(row.volume) || 0,
      volume24hr: Number(row.volume24hr) || 0,
      liquidity: Number(row.liquidity) || 0,
    };
  }

  private _drizzleMarketToRow(row: typeof markets.$inferSelect): MarketRow {
    return {
      id: row.id,
      locale: row.locale,
      event_id: row.eventId,
      question: row.question || '',
      slug: row.slug || '',
      group_item_title: row.groupItemTitle || '',
      condition_id: row.conditionId,
      image: row.image || '',
      icon: row.icon || '',
      active: row.active ? 1 : 0,
      closed: row.closed ? 1 : 0,
      negative_risk: row.negRisk ? 1 : 0,
      outcomes: row.outcomes,
      outcome_prices: row.outcomePrices,
      clob_token_ids: row.clobTokenIds,
      clob_token_ids_0: row.clobTokenIds0,
      clob_token_ids_1: row.clobTokenIds1,
      outcomes_0: row.outcomes0,
      outcomes_1: row.outcomes1,
      outcome_prices_0: row.outcomePrices0,
      outcome_prices_1: row.outcomePrices1,
      volume: Number(row.volume) || 0,
      volume24hr: Number(row.volume24hr) || 0,
      liquidity: Number(row.liquidity) || 0,
      updated_at: row.updatedAt,
    };
  }

  private _attachMarkets(eventList: EventListItem[]): EventListItem[] {
    if (!eventList.length) return eventList;

    const sqlite = getSqlite();
    const ids = eventList.map((event) => event.id);
    const placeholders = ids.map(() => '?').join(',');
    const rows = sqlite
      .prepare(
        `SELECT * FROM markets WHERE event_id IN (${placeholders}) ORDER BY group_item_title COLLATE NOCASE`,
      )
      .all(...ids) as MarketRow[];

    const byEvent: Record<string, DbMarket[]> = {};
    for (const row of rows) {
      if (!byEvent[row.event_id]) byEvent[row.event_id] = [];
      byEvent[row.event_id].push(this._rowToMarket(row));
    }

    return eventList.map((event) => ({ ...event, markets: byEvent[event.id] || [] }));
  }

  private _eventsFromClause(watchlistOnly: boolean): string {
    if (watchlistOnly) {
      return 'events e INNER JOIN watchlist w ON w.event_id = e.id';
    }
    return 'events e';
  }

  private _prefixWhereForJoin(where: string, withAlias: boolean): string {
    if (!where) return '';
    if (!withAlias) return where;
    return where.replace(
      /(?<!\.)\b(volume24hr|volume|liquidity|market_count|title|slug|active|closed|start_date|start_time|end_date|category|sport_id|featured|parent_event_id)\b/g,
      'e.$1',
    );
  }
}

export { SqliteEventRepository };
