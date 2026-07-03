import { randomUUID } from 'crypto';
import type { WorkflowTaskRecord, WorkflowTaskRepository } from '@polytrader/repository-contract';
import type {
  WorkflowEnqueueInput,
  WorkflowGroupConfig,
  WorkflowHandler,
  WorkflowRuntimeOptions,
} from './types.js';

const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_BATCH_SIZE = 5;
const DEFAULT_MAX_ATTEMPTS = 3;

class WorkflowRuntime {
  private readonly _repository: WorkflowTaskRepository;
  private readonly _handlers: Map<string, WorkflowHandler>;
  private readonly _groups: Map<string, WorkflowGroupConfig>;
  private readonly _pollIntervalMs: number;
  private readonly _batchSize: number;
  private readonly _workerId: string;
  private readonly _activeTaskCountsByGroup: Map<string, number>;
  private _timer: ReturnType<typeof setTimeout> | null;
  private _running: boolean;
  private _draining: boolean;

  public constructor(options: WorkflowRuntimeOptions) {
    this._repository = options.repository;
    this._handlers = new Map();
    this._groups = new Map(Object.entries(options.groups ?? {}));
    this._pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this._batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    this._workerId = options.workerId ?? `workflow-${randomUUID()}`;
    this._activeTaskCountsByGroup = new Map();
    this._timer = null;
    this._running = false;
    this._draining = false;
  }

  public register(type: string, handler: WorkflowHandler): void {
    const normalizedType = type.trim();
    if (!normalizedType) throw new Error('Workflow type is required');
    this._handlers.set(normalizedType, handler);
  }

  public async enqueue(input: WorkflowEnqueueInput): Promise<WorkflowTaskRecord> {
    const normalizedType = input.type.trim();
    if (!normalizedType) throw new Error('Workflow type is required');
    const groupKey = (input.groupKey?.trim() || normalizedType).trim();
    const task = await this._repository.create({
      type: normalizedType,
      groupKey,
      payloadJson: JSON.stringify(input.payload ?? null),
      idempotencyKey: input.idempotencyKey,
      maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      nextRunAt: input.nextRunAt,
    });
    this._scheduleSoon();
    return task;
  }

  public start(): void {
    if (this._running) return;
    this._running = true;
    this._scheduleSoon();
  }

  public stop(): void {
    this._running = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  private _scheduleSoon(): void {
    if (!this._running) return;
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      void this._drainDueTasks();
    }, 0);
  }

  private _scheduleNextPoll(): void {
    if (!this._running || this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      void this._drainDueTasks();
    }, this._pollIntervalMs);
  }

  private async _drainDueTasks(): Promise<void> {
    if (!this._running || this._draining) return;
    this._draining = true;
    try {
      const dueTasks = await this._repository.listDue(this._now(), this._batchSize);
      for (const task of dueTasks) {
        if (!this._canRunTask(task)) continue;
        this._trackRunTask(task);
      }
    } finally {
      this._draining = false;
      this._scheduleNextPoll();
    }
  }

  private _trackRunTask(task: WorkflowTaskRecord): void {
    const groupKey = this._groupKey(task);
    this._incrementActiveTaskCount(groupKey);
    void this._runTask(task).finally(() => {
      this._decrementActiveTaskCount(groupKey);
      this._scheduleSoon();
    });
  }

  private _canRunTask(task: WorkflowTaskRecord): boolean {
    const groupKey = this._groupKey(task);
    const activeCount = this._activeTaskCountsByGroup.get(groupKey) ?? 0;
    return activeCount < this._groupConcurrency(groupKey);
  }

  private _groupConcurrency(groupKey: string): number {
    const config = this._groups.get(groupKey);
    if (!config || config.mode === 'serial') return 1;
    return Math.max(1, Math.trunc(config.concurrency));
  }

  private _groupKey(task: WorkflowTaskRecord): string {
    return task.groupKey.trim() || task.type;
  }

  private _incrementActiveTaskCount(groupKey: string): void {
    this._activeTaskCountsByGroup.set(
      groupKey,
      (this._activeTaskCountsByGroup.get(groupKey) ?? 0) + 1,
    );
  }

  private _decrementActiveTaskCount(groupKey: string): void {
    const next = (this._activeTaskCountsByGroup.get(groupKey) ?? 1) - 1;
    if (next <= 0) {
      this._activeTaskCountsByGroup.delete(groupKey);
      return;
    }
    this._activeTaskCountsByGroup.set(groupKey, next);
  }

  private async _runTask(task: WorkflowTaskRecord): Promise<void> {
    const claimed = await this._repository.claim(task.id, this._workerId, this._now());
    if (!claimed) return;

    const handler = this._handlers.get(claimed.type);
    if (!handler) {
      await this._failOrRetry(
        claimed,
        new Error(`No workflow handler registered: ${claimed.type}`),
      );
      return;
    }

    try {
      const result = await handler({
        task: claimed,
        payload: this._parsePayload(claimed),
      });
      await this._repository.update(claimed.id, {
        status: 'succeeded',
        resultJson: result === undefined ? null : JSON.stringify(result),
        errorMessage: null,
        nextRunAt: null,
        lockedAt: null,
        lockedBy: null,
        finishedAt: this._now(),
      });
    } catch (error) {
      await this._failOrRetry(claimed, error);
    }
  }

  private async _failOrRetry(task: WorkflowTaskRecord, error: unknown): Promise<void> {
    const message = this._errorMessage(error);
    const retry = task.attemptCount < task.maxAttempts;
    await this._repository.update(task.id, {
      status: retry ? 'retry_scheduled' : 'failed',
      errorMessage: message,
      nextRunAt: retry ? this._nextRetryAt(task.attemptCount) : null,
      lockedAt: null,
      lockedBy: null,
      finishedAt: retry ? null : this._now(),
    });
  }

  private _parsePayload(task: WorkflowTaskRecord): unknown {
    try {
      return JSON.parse(task.payloadJson);
    } catch {
      throw new Error(`Workflow task payload is not valid JSON: ${task.id}`);
    }
  }

  private _nextRetryAt(attemptCount: number): string {
    const delayMs = Math.min(1000 * 2 ** Math.max(0, attemptCount - 1), 60_000);
    return new Date(Date.now() + delayMs).toISOString();
  }

  private _errorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) return error.message.trim();
    if (typeof error === 'string' && error.trim()) return error.trim();
    return 'Unknown workflow error';
  }

  private _now(): string {
    return new Date().toISOString();
  }
}

export { WorkflowRuntime };
