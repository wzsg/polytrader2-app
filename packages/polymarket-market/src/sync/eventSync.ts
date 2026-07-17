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
  cancelPolymarketEventSync(): Promise<void>;
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
  private _activeController: AbortController | null = null;
  private _activeRunPromise: Promise<EventSyncResult> | null = null;

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

  public run(input: EventSyncWorkflowInput, signal?: AbortSignal): Promise<EventSyncResult> {
    if (this._activeRunPromise) {
      return Promise.reject(new Error('Event sync is already running'));
    }

    const controller = new AbortController();
    const forwardAbort = (): void => controller.abort();
    let removeAbortListener = false;
    if (signal?.aborted) {
      controller.abort();
    } else if (signal) {
      signal.addEventListener('abort', forwardAbort, { once: true });
      removeAbortListener = true;
    }

    this._activeController = controller;
    const runPromise = this.runSync(input, controller.signal).finally(() => {
      if (removeAbortListener) signal?.removeEventListener('abort', forwardAbort);
      if (this._activeRunPromise !== runPromise) return;
      this._activeController = null;
      this._activeRunPromise = null;
    });
    this._activeRunPromise = runPromise;
    return runPromise;
  }

  public async abortAndWait(): Promise<void> {
    const controller = this._activeController;
    const runPromise = this._activeRunPromise;
    if (!runPromise) return;

    if (controller && !controller.signal.aborted) controller.abort();
    try {
      await runPromise;
    } catch (error) {
      if (!this.isAbortError(error)) throw error;
    }
  }

  private async runSync(
    input: EventSyncWorkflowInput,
    signal: AbortSignal,
  ): Promise<EventSyncResult> {
    const result = this.createResult(input);
    const seenEventIds: string[] = [];
    let totalEvents: number | null = null;
    try {
      this.throwIfAborted(signal);
      this.emitSyncingStatus(0, 0, null);
      for await (const data of this._client.streamOpenEvents(
        signal,
        input.locale,
        this._batchSize,
      )) {
        this.throwIfAborted(signal);
        const events = data.events || [];
        if (events.length === 0) continue;

        totalEvents = this.resolveTotalEvents(totalEvents, data.totalEvents);

        seenEventIds.push(...events.map((event) => String(event.id || '')).filter(Boolean));
        const stats = await this._eventRepository.bulkUpsert(events, input.locale);
        this.applyBulkUpsertStats(result, stats);
        result.pagesFetched++;
        result.eventsFetched += events.length;
        this.throwIfAborted(signal);
        this.emitSyncingStatus(result.pagesFetched, result.eventsFetched, totalEvents);
      }

      this.throwIfAborted(signal);
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
    return (
      typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
    );
  }

  private throwIfAborted(signal: AbortSignal): void {
    if (!signal.aborted) return;
    const error = new Error('The operation was aborted');
    error.name = 'AbortError';
    throw error;
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
  private _shutdown = false;
  private _operationTail: Promise<void> = Promise.resolve();

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

  public enqueue(trigger: EventSyncTrigger, options?: { replacePending?: boolean }): Promise<void> {
    if (this._shutdown) return Promise.reject(this.createAbortError());
    const input: EventSyncWorkflowInput = {
      locale: this._locale,
      trigger,
    };
    return this.queueOperation(async () => {
      if (this._shutdown) throw this.createAbortError();
      await this._workflowScheduler.enqueuePolymarketEventSync(input, options);
    });
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
    if (this._shutdown) throw this.createAbortError();
    const next = config ?? (await this.readConfig());
    if (this._shutdown) throw this.createAbortError();
    this.clear();
    if (!next.enabled) return;

    if (initialTrigger) {
      await this.enqueue(initialTrigger);
    }
    if (this._shutdown) throw this.createAbortError();
    this._timer = setInterval(() => {
      if (this._shutdown) return;
      void this.enqueue('schedule').catch((error) => {
        if (this.isAbortError(error)) return;
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

  public cancel(): Promise<void> {
    return this.queueOperation(() => this._workflowScheduler.cancelPolymarketEventSync());
  }

  public shutdown(): Promise<void> {
    this._shutdown = true;
    this.clear();
    return this.queueOperation(() => this._workflowScheduler.cancelPolymarketEventSync());
  }

  private queueOperation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this._operationTail.then(operation);
    this._operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
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

  private createAbortError(): Error {
    const error = new Error('Event sync scheduler is shutting down');
    error.name = 'AbortError';
    return error;
  }

  private isAbortError(error: unknown): boolean {
    return (
      typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
    );
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
