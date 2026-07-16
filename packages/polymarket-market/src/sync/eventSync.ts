import { EventEmitter } from 'events';
import type {
  EventBulkUpsertStats,
  EventRepository,
  MetaRepository,
} from '@polytrader/repository-contract';
import type {
  AppLocale,
  EventSyncTrigger,
  EventSyncScheduleConfig,
  EventSyncStatus,
} from '@polytrader/shared';
import {
  DEFAULT_EVENT_SYNC_BATCH_SIZE,
  DEFAULT_LOCALE,
  MAX_EVENT_SYNC_BATCH_SIZE,
} from '@polytrader/shared';
import type { EventSyncClient } from './types.js';

const DEFAULT_EVENT_SYNC_SCHEDULE_CONFIG: EventSyncScheduleConfig = {
  enabled: true,
  intervalMinutes: 10,
};
const EVENT_SYNC_SCHEDULE_CONFIG_KEY = 'event_sync_schedule_config';
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
  batchSize?: number;
}

type EventSyncEventMap = {
  status: [status: EventSyncStatus];
};

class EventSyncService extends EventEmitter<EventSyncEventMap> {
  private readonly _eventRepository: EventRepository;
  private readonly _metaRepository: MetaRepository;
  private readonly _client: EventSyncClient;
  private _batchSize: number;
  private _isSyncing = false;

  public constructor(options: EventSyncServiceOptions) {
    super();
    this._eventRepository = options.eventRepository;
    this._metaRepository = options.metaRepository;
    this._client = options.client;
    this._batchSize = this.normalizeBatchSize(options.batchSize ?? DEFAULT_EVENT_SYNC_BATCH_SIZE);
  }

  public setBatchSize(batchSize: number): void {
    this._batchSize = this.normalizeBatchSize(batchSize);
  }

  public async run(input: EventSyncWorkflowInput, signal: AbortSignal): Promise<EventSyncResult> {
    if (this._isSyncing) throw new Error('Event sync is already running');

    const result = this.createResult(input);
    const seenEventIds: string[] = [];
    let totalEvents: number | null = null;
    this._isSyncing = true;
    try {
      this.emitSyncingStatus(0, 0, null);
      for await (const data of this._client.streamOpenEvents(
        signal,
        input.locale,
        this._batchSize,
      )) {
        const events = data.events || [];
        if (events.length === 0) continue;

        totalEvents = this.resolveTotalEvents(totalEvents, data.totalEvents);

        seenEventIds.push(...events.map((event) => String(event.id || '')).filter(Boolean));
        const stats = await this._eventRepository.bulkUpsert(events, input.locale);
        this.applyBulkUpsertStats(result, stats);
        result.pagesFetched++;
        result.eventsFetched += events.length;
        this.emitSyncingStatus(result.pagesFetched, result.eventsFetched, totalEvents);
      }

      if (!seenEventIds.length) {
        throw new Error('Event snapshot did not include any events');
      }
      if (totalEvents === null || result.eventsFetched !== totalEvents) {
        throw new Error(
          `Event snapshot count mismatch: expected ${totalEvents ?? 'unknown'}, received ${result.eventsFetched}`,
        );
      }

      this.emitStatus(
        this.createProgressStatus(
          'finalizing',
          result.pagesFetched,
          result.eventsFetched,
          totalEvents,
        ),
      );
      result.closedMissingEvents =
        await this._eventRepository.markOpenEventsMissingFromSnapshotClosed(seenEventIds);
      await this._metaRepository.setLastEventSyncTime();
      this.emitStatus(
        this.createProgressStatus('done', result.pagesFetched, result.eventsFetched, totalEvents),
      );
      return result;
    } catch (err) {
      if (this.isAbortError(err)) {
        this.emitStatus(
          this.createProgressStatus(
            'aborted',
            result.pagesFetched,
            result.eventsFetched,
            totalEvents,
          ),
        );
      } else {
        this.emitStatus({
          ...this.createProgressStatus(
            'error',
            result.pagesFetched,
            result.eventsFetched,
            totalEvents,
          ),
          error: this.errorMessage(err),
        });
      }
      throw err;
    } finally {
      this._isSyncing = false;
    }
  }

  private emitStatus(status: EventSyncStatus): void {
    this.emit('status', status);
  }

  private emitSyncingStatus(
    page: number,
    completedEvents: number,
    totalEvents: number | null,
  ): void {
    this.emitStatus(this.createProgressStatus('syncing', page, completedEvents, totalEvents));
  }

  private createProgressStatus(
    state: EventSyncStatus['state'],
    page: number,
    completedEvents: number,
    totalEvents: number | null,
  ): EventSyncStatus {
    const progressPercent =
      totalEvents === null ? 0 : Math.min(100, Math.floor((completedEvents / totalEvents) * 100));
    return {
      state,
      page,
      completedEvents,
      totalEvents: totalEvents ?? undefined,
      progressPercent,
    };
  }

  private resolveTotalEvents(current: number | null, next: number | undefined): number {
    if (next === undefined || !Number.isSafeInteger(next) || next <= 0) {
      throw new Error('Event snapshot page did not include a valid totalEvents value');
    }
    if (current !== null && current !== next) {
      throw new Error(`Event snapshot total changed during sync: ${current} -> ${next}`);
    }
    return next;
  }

  private normalizeBatchSize(batchSize: number): number {
    if (!Number.isFinite(batchSize)) return DEFAULT_EVENT_SYNC_BATCH_SIZE;
    return Math.max(0, Math.min(MAX_EVENT_SYNC_BATCH_SIZE, Math.trunc(batchSize)));
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

  public async readConfig(): Promise<EventSyncScheduleConfig> {
    const value = await this._metaRepository.getMetaValue(EVENT_SYNC_SCHEDULE_CONFIG_KEY);
    if (!value) return DEFAULT_EVENT_SYNC_SCHEDULE_CONFIG;

    try {
      return this.normalizeScheduleConfig(JSON.parse(value) as Partial<EventSyncScheduleConfig>);
    } catch {
      return DEFAULT_EVENT_SYNC_SCHEDULE_CONFIG;
    }
  }

  public async writeConfig(
    config: Partial<EventSyncScheduleConfig>,
  ): Promise<EventSyncScheduleConfig> {
    const current = await this.readConfig();
    const next = this.normalizeScheduleConfig({ ...current, ...config });
    await this._metaRepository.setMetaValue(EVENT_SYNC_SCHEDULE_CONFIG_KEY, JSON.stringify(next));
    return next;
  }

  public async apply(
    config?: EventSyncScheduleConfig,
    initialTrigger: EventSyncTrigger | null = 'startup',
  ): Promise<void> {
    const next = config ?? (await this.readConfig());
    this.clear();
    if (!next.enabled) return;

    if (initialTrigger) {
      await this.enqueue(initialTrigger);
    }
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
    if (!Number.isFinite(minutes)) return DEFAULT_EVENT_SYNC_SCHEDULE_CONFIG.intervalMinutes;
    return Math.max(MIN_INTERVAL_MINUTES, Math.min(MAX_INTERVAL_MINUTES, Math.trunc(minutes)));
  }

  private normalizeScheduleConfig(
    config: Partial<EventSyncScheduleConfig> | null,
  ): EventSyncScheduleConfig {
    return {
      enabled: config?.enabled === true,
      intervalMinutes: this.clampIntervalMinutes(config?.intervalMinutes),
    };
  }
}

export { DEFAULT_EVENT_SYNC_SCHEDULE_CONFIG, EventSyncScheduler, EventSyncService };
export type {
  EventSyncEventMap,
  EventSyncResult,
  EventSyncServiceOptions,
  EventSyncWorkflowInput,
  EventSyncWorkflowScheduler,
};
