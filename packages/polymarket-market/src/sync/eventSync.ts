import { EventEmitter } from 'events';
import type {
  EventBulkUpsertStats,
  EventRepository,
  MetaRepository,
} from '@polytrader/repository-contract';
import type {
  AppLocale,
  EventSyncTrigger,
  SyncScheduleConfig,
  SyncStatus,
} from '@polytrader/shared';
import { DEFAULT_LOCALE } from '@polytrader/shared';
import type { EventSyncClient } from './types.js';

const DEFAULT_SCHEDULE_CONFIG: SyncScheduleConfig = {
  enabled: true,
  intervalMinutes: 10,
};
const SCHEDULE_CONFIG_KEY = 'sync_schedule_config';
const MIN_INTERVAL_MINUTES = 1;
const MAX_INTERVAL_MINUTES = 60;

interface EventSyncResult {
  locale: AppLocale;
  trigger: EventSyncTrigger;
  pagesFetched: number;
  eventsFetched: number;
  eventsUpserted: number;
  eventsSkipped: number;
  marketsUpserted: number;
  tagsUpserted: number;
  closedMissingEvents: number;
}

interface EventSyncWorkflowInput {
  locale: AppLocale;
  trigger: EventSyncTrigger;
}

interface EventSyncWorkflowScheduler {
  enqueuePolymarketEventSync(
    input: EventSyncWorkflowInput,
    options?: { replacePending?: boolean },
  ): Promise<void>;
}

interface EventSyncServiceOptions {
  eventRepository: EventRepository;
  metaRepository: MetaRepository;
  client: EventSyncClient;
}

type EventSyncEventMap = {
  status: [status: SyncStatus];
};

class EventSyncService extends EventEmitter<EventSyncEventMap> {
  private readonly _eventRepository: EventRepository;
  private readonly _metaRepository: MetaRepository;
  private readonly _client: EventSyncClient;
  private _isSyncing = false;

  public constructor(options: EventSyncServiceOptions) {
    super();
    this._eventRepository = options.eventRepository;
    this._metaRepository = options.metaRepository;
    this._client = options.client;
  }

  public async run(input: EventSyncWorkflowInput, signal: AbortSignal): Promise<EventSyncResult> {
    if (this._isSyncing) throw new Error('Event sync is already running');

    const result = this.createResult(input);
    const seenEventIds: string[] = [];
    this._isSyncing = true;
    try {
      this.emitSyncingStatus(0, 0);
      for await (const data of this._client.streamOpenEvents(signal, input.locale)) {
        const events = data.events || [];
        if (events.length === 0) continue;

        seenEventIds.push(...events.map((event) => String(event.id || '')).filter(Boolean));
        const stats = await this._eventRepository.bulkUpsert(events, input.locale);
        this.applyBulkUpsertStats(result, stats);
        result.pagesFetched++;
        result.eventsFetched += events.length;
        this.emitSyncingStatus(result.pagesFetched, result.eventsFetched);
      }

      if (!seenEventIds.length) {
        throw new Error('Event snapshot did not include any events');
      }

      result.closedMissingEvents =
        await this._eventRepository.markOpenEventsMissingFromSnapshotClosed(seenEventIds);
      await this._metaRepository.setLastSyncTime();
      this.emitStatus({
        state: 'done',
        page: result.pagesFetched,
        total: result.eventsFetched,
      });
      return result;
    } catch (err) {
      if (this.isAbortError(err)) {
        this.emitStatus({ state: 'aborted', total: result.eventsFetched });
      } else {
        this.emitStatus({ state: 'error', error: this.errorMessage(err) });
      }
      throw err;
    } finally {
      this._isSyncing = false;
    }
  }

  private emitStatus(status: SyncStatus): void {
    this.emit('status', status);
  }

  private emitSyncingStatus(page: number, total: number): void {
    this.emitStatus({ state: 'syncing', page, total });
  }

  private createResult(input: EventSyncWorkflowInput): EventSyncResult {
    return {
      locale: input.locale,
      trigger: input.trigger,
      pagesFetched: 0,
      eventsFetched: 0,
      eventsUpserted: 0,
      eventsSkipped: 0,
      marketsUpserted: 0,
      tagsUpserted: 0,
      closedMissingEvents: 0,
    };
  }

  private applyBulkUpsertStats(result: EventSyncResult, stats: EventBulkUpsertStats): void {
    result.eventsUpserted += stats.eventsUpserted;
    result.eventsSkipped += stats.eventsSkipped;
    result.marketsUpserted += stats.marketsUpserted;
    result.tagsUpserted += stats.tagsUpserted;
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

class EventSyncScheduler {
  private readonly _workflowScheduler: EventSyncWorkflowScheduler;
  private readonly _metaRepository: MetaRepository;
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _locale: AppLocale = DEFAULT_LOCALE;

  public constructor(
    workflowScheduler: EventSyncWorkflowScheduler,
    metaRepository: MetaRepository,
  ) {
    this._workflowScheduler = workflowScheduler;
    this._metaRepository = metaRepository;
  }

  public setLocale(locale: AppLocale): void {
    this._locale = locale;
  }

  public async enqueue(
    trigger: EventSyncTrigger,
    options?: { replacePending?: boolean },
  ): Promise<void> {
    await this._workflowScheduler.enqueuePolymarketEventSync(
      {
        locale: this._locale,
        trigger,
      },
      options,
    );
  }

  public async readConfig(): Promise<SyncScheduleConfig> {
    const value = await this._metaRepository.getMetaValue(SCHEDULE_CONFIG_KEY);
    if (!value) return DEFAULT_SCHEDULE_CONFIG;

    try {
      return this.normalizeScheduleConfig(JSON.parse(value) as Partial<SyncScheduleConfig>);
    } catch {
      return DEFAULT_SCHEDULE_CONFIG;
    }
  }

  public async writeConfig(config: Partial<SyncScheduleConfig>): Promise<SyncScheduleConfig> {
    const current = await this.readConfig();
    const next = this.normalizeScheduleConfig({ ...current, ...config });
    await this._metaRepository.setMetaValue(SCHEDULE_CONFIG_KEY, JSON.stringify(next));
    return next;
  }

  public async apply(
    config?: SyncScheduleConfig,
    initialTrigger: EventSyncTrigger = 'startup',
  ): Promise<void> {
    const next = config ?? (await this.readConfig());
    this.clear();
    if (!next.enabled) return;

    await this.enqueue(initialTrigger);
    this._timer = setInterval(() => {
      void this.enqueue('schedule').catch((error) => {
        console.warn('Failed to enqueue scheduled event sync', error);
      });
    }, next.intervalMinutes * 60_000);
  }

  public clear(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  private clampIntervalMinutes(value: unknown): number {
    const minutes = Number(value);
    if (!Number.isFinite(minutes)) return DEFAULT_SCHEDULE_CONFIG.intervalMinutes;
    return Math.max(MIN_INTERVAL_MINUTES, Math.min(MAX_INTERVAL_MINUTES, Math.trunc(minutes)));
  }

  private normalizeScheduleConfig(config: Partial<SyncScheduleConfig> | null): SyncScheduleConfig {
    return {
      enabled: config?.enabled === true,
      intervalMinutes: this.clampIntervalMinutes(config?.intervalMinutes),
    };
  }
}

export { DEFAULT_SCHEDULE_CONFIG, EventSyncScheduler, EventSyncService };
export type {
  EventSyncEventMap,
  EventSyncResult,
  EventSyncServiceOptions,
  EventSyncWorkflowInput,
  EventSyncWorkflowScheduler,
};
