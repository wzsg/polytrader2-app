import { randomUUID } from 'crypto';
import type { WorkflowTaskRecord, WorkflowTaskRepository } from '@polytrader/repository-contract';
import type {
  WorkflowEnqueueInput,
  WorkflowGroupConfig,
  WorkflowHandler,
  WorkflowHandlerOptions,
  WorkflowRuntimeOptions,
} from './types.js';

const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_BATCH_SIZE = 5;
const DEFAULT_MAX_ATTEMPTS = 3;

interface ActiveWorkflowTask {
  controller: AbortController;
  groupKey: string;
  cancelOnStop: boolean;
}

class WorkflowRuntime {
  private readonly _repository: WorkflowTaskRepository;
  private readonly _handlers: Map<string, WorkflowHandler>;
  private readonly _handlerOptions: Map<string, WorkflowHandlerOptions>;
  private readonly _groups: Map<string, WorkflowGroupConfig>;
  private readonly _pollIntervalMs: number;
  private readonly _batchSize: number;
  private readonly _workerId: string;
  private readonly _activeTaskCountsByGroup: Map<string, number>;
  private readonly _activeTasks: Map<Promise<void>, ActiveWorkflowTask>;
  private readonly _activeEnqueues: Map<Promise<WorkflowTaskRecord>, string>;
  private readonly _groupCancellationPromises: Map<string, Promise<void>>;
  private _timer: ReturnType<typeof setTimeout> | null;
  private _running: boolean;
  private _drainPromise: Promise<void> | null;
  private _stopPromise: Promise<void> | null;

  public constructor(options: WorkflowRuntimeOptions) {
    this._repository = options.repository;
    this._handlers = new Map();
    this._handlerOptions = new Map();
    this._groups = new Map(Object.entries(options.groups ?? {}));
    this._pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this._batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    this._workerId = options.workerId ?? `workflow-${randomUUID()}`;
    this._activeTaskCountsByGroup = new Map();
    this._activeTasks = new Map();
    this._activeEnqueues = new Map();
    this._groupCancellationPromises = new Map();
    this._timer = null;
    this._running = false;
    this._drainPromise = null;
    this._stopPromise = null;
  }

  public register(
    type: string,
    handler: WorkflowHandler,
    options: WorkflowHandlerOptions = {},
  ): void {
    const normalizedType = type.trim();
    if (!normalizedType) throw new Error('Workflow type is required');
    this._handlers.set(normalizedType, handler);
    this._handlerOptions.set(normalizedType, options);
  }

  public async enqueue(input: WorkflowEnqueueInput): Promise<WorkflowTaskRecord> {
    if (this._stopPromise) {
      throw this._createAbortError('Workflow runtime is stopping or has stopped');
    }

    const normalizedType = input.type.trim();
    if (!normalizedType) throw new Error('Workflow type is required');
    const groupKey = (input.groupKey?.trim() || normalizedType).trim();
    const groupCancellationPromise = this._groupCancellationPromises.get(groupKey);
    if (groupCancellationPromise) {
      await groupCancellationPromise;
      if (this._stopPromise) {
        throw this._createAbortError('Workflow runtime is stopping or has stopped');
      }
    }

    const createPromise = this._repository.create({
      type: normalizedType,
      groupKey,
      payloadJson: JSON.stringify(input.payload ?? null),
      idempotencyKey: input.idempotencyKey,
      maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      nextRunAt: input.nextRunAt,
    });
    this._activeEnqueues.set(createPromise, groupKey);
    try {
      const task = await createPromise;
      this._scheduleSoon();
      return task;
    } finally {
      this._activeEnqueues.delete(createPromise);
    }
  }

  public start(): void {
    if (this._running || this._stopPromise) return;
    this._running = true;
    this._scheduleSoon();
  }

  public stop(): Promise<void> {
    if (this._stopPromise) return this._stopPromise;

    this._running = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }

    const stopPromise = Promise.resolve().then(() => this._waitForShutdown());
    this._stopPromise = stopPromise;
    this._abortActiveTasks((task) => task.cancelOnStop);
    return stopPromise;
  }

  public cancelGroup(groupKey: string): Promise<void> {
    const normalizedGroupKey = groupKey.trim();
    if (!normalizedGroupKey) return Promise.reject(new Error('Workflow group key is required'));

    const existingPromise = this._groupCancellationPromises.get(normalizedGroupKey);
    if (existingPromise) return existingPromise;

    const cancellationPromise = Promise.resolve().then(() => this._cancelGroup(normalizedGroupKey));
    this._groupCancellationPromises.set(normalizedGroupKey, cancellationPromise);
    void cancellationPromise.then(
      () => this._completeGroupCancellation(normalizedGroupKey, cancellationPromise),
      () => this._completeGroupCancellation(normalizedGroupKey, cancellationPromise),
    );
    return cancellationPromise;
  }

  private async _cancelGroup(groupKey: string): Promise<void> {
    this._abortActiveTasks((task) => task.groupKey === groupKey);
    await this._waitForEnqueues(groupKey);
    if (this._drainPromise) await Promise.allSettled([this._drainPromise]);
    this._abortActiveTasks((task) => task.groupKey === groupKey);
    await this._waitForActiveTasks((task) => task.groupKey === groupKey);
    await this._repository.cancelPendingByGroup(groupKey, this._now());
  }

  private async _waitForEnqueues(groupKey: string): Promise<void> {
    while (true) {
      const promises = [...this._activeEnqueues.entries()]
        .filter(([, activeGroupKey]) => activeGroupKey === groupKey)
        .map(([promise]) => promise);
      if (promises.length === 0) return;
      await Promise.allSettled(promises);
    }
  }

  private _isGroupBeingCanceled(groupKey: string): boolean {
    return this._groupCancellationPromises.has(groupKey);
  }

  private _completeGroupCancellation(groupKey: string, promise: Promise<void>): void {
    if (this._groupCancellationPromises.get(groupKey) === promise) {
      this._groupCancellationPromises.delete(groupKey);
      this._scheduleSoon();
    }
  }

  private _scheduleSoon(): void {
    if (!this._running) return;
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      this._startDrain();
    }, 0);
  }

  private _scheduleNextPoll(): void {
    if (!this._running || this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      this._startDrain();
    }, this._pollIntervalMs);
  }

  private _startDrain(): void {
    if (!this._running || this._drainPromise) return;

    const drainPromise = this._drainDueTasks();
    this._drainPromise = drainPromise;
    void drainPromise.then(
      () => this._completeDrain(drainPromise),
      (error: unknown) => {
        this._completeDrain(drainPromise);
        this._reportAsyncError('Workflow task polling failed', error);
      },
    );
  }

  private _completeDrain(drainPromise: Promise<void>): void {
    if (this._drainPromise === drainPromise) {
      this._drainPromise = null;
    }
    this._scheduleNextPoll();
  }

  private async _drainDueTasks(): Promise<void> {
    if (!this._running) return;

    const dueTasks = await this._repository.listDue(this._now(), this._batchSize);
    if (!this._running) return;

    for (const task of dueTasks) {
      if (!this._running) return;
      if (!this._canRunTask(task)) continue;
      this._trackRunTask(task);
    }
  }

  private _trackRunTask(task: WorkflowTaskRecord): void {
    const groupKey = this._groupKey(task);
    const controller = new AbortController();
    this._incrementActiveTaskCount(groupKey);

    const taskPromise = this._runTask(task, controller.signal);
    this._activeTasks.set(taskPromise, {
      controller,
      groupKey,
      cancelOnStop: this._handlerOptions.get(task.type)?.cancelOnStop === true,
    });
    void taskPromise.then(
      () => this._completeTrackedTask(taskPromise, groupKey),
      (error: unknown) => {
        this._completeTrackedTask(taskPromise, groupKey);
        this._reportAsyncError(`Workflow task execution failed: ${task.id}`, error);
      },
    );
  }

  private _completeTrackedTask(taskPromise: Promise<void>, groupKey: string): void {
    this._activeTasks.delete(taskPromise);
    this._decrementActiveTaskCount(groupKey);
    this._scheduleSoon();
  }

  private _canRunTask(task: WorkflowTaskRecord): boolean {
    const groupKey = this._groupKey(task);
    if (this._isGroupBeingCanceled(groupKey)) return false;
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

  private async _runTask(task: WorkflowTaskRecord, signal: AbortSignal): Promise<void> {
    const claimed = await this._repository.claim(task.id, this._workerId, this._now());
    if (!claimed) return;

    if (signal.aborted) {
      await this._cancelTask(claimed);
      return;
    }

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
        signal,
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
      if (signal.aborted || this._isAbortError(error)) {
        await this._cancelTask(claimed);
        return;
      }
      await this._failOrRetry(claimed, error);
    }
  }

  private async _cancelTask(task: WorkflowTaskRecord): Promise<void> {
    await this._repository.update(task.id, {
      status: 'canceled',
      resultJson: null,
      errorMessage: null,
      nextRunAt: null,
      lockedAt: null,
      lockedBy: null,
      finishedAt: this._now(),
    });
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

  private _isAbortError(error: unknown): boolean {
    if (error instanceof Error) return error.name === 'AbortError';
    return (
      typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
    );
  }

  private _createAbortError(message: string): Error {
    const error = new Error(message);
    error.name = 'AbortError';
    return error;
  }

  private _abortActiveTasks(predicate: (task: ActiveWorkflowTask) => boolean): void {
    for (const task of this._activeTasks.values()) {
      if (predicate(task) && !task.controller.signal.aborted) task.controller.abort();
    }
  }

  private async _waitForShutdown(): Promise<void> {
    if (this._drainPromise) await Promise.allSettled([this._drainPromise]);
    this._abortActiveTasks((task) => task.cancelOnStop);
    await this._waitForActiveTasks((task) => task.cancelOnStop);
  }

  private async _waitForActiveTasks(
    predicate: (task: ActiveWorkflowTask) => boolean,
  ): Promise<void> {
    while (true) {
      const promises = [...this._activeTasks.entries()]
        .filter(([, task]) => predicate(task))
        .map(([promise]) => promise);
      if (promises.length === 0) return;
      await Promise.allSettled(promises);
    }
  }

  private _reportAsyncError(message: string, error: unknown): void {
    console.error(message, error);
  }

  private _now(): string {
    return new Date().toISOString();
  }
}

export { WorkflowRuntime };
