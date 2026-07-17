import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PolymarketMarketService } from '@polytrader/polymarket-market';
import { closeDb, createSqliteWorkflowTaskRepository, initDb } from '@polytrader/sqlite-repository';
import { WorkflowRuntime } from '@polytrader/workflow';

const EVENT_SYNC_WORKFLOW = 'polymarket-event.sync';
const PERSISTENT_WORKFLOW = 'persistent-workflow.fixture';
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, '..', '..', '..');
const migrationsFolder = path.join(workspaceRoot, 'apps', 'desktop', 'drizzle');
const unexpectedErrors = [];

function recordUncaughtException(error) {
  unexpectedErrors.push(`uncaughtException: ${formatError(error)}`);
}

function recordUnhandledRejection(error) {
  unexpectedErrors.push(`unhandledRejection: ${formatError(error)}`);
}

function formatError(error) {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

async function withTimeout(promise, name) {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${name} timed out`)), 2_000);
  });
  return await Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

function createCacheStore() {
  return {
    async getOrSetValue(_key, _ttlMs, loader) {
      return await loader();
    },
  };
}

function createBulkUpsertResult(events) {
  return {
    received: events.length,
    eventsUpserted: events.length,
    eventsSkipped: 0,
    marketsUpserted: 0,
    tagsUpserted: 0,
  };
}

function createUnusedMarketTradeRepository() {
  throw new Error('Market trade repository is not used by this smoke test');
}

async function verifyShutdownCancelsActiveSync(workflowRepository) {
  const runtime = new WorkflowRuntime({
    repository: workflowRepository,
    pollIntervalMs: 10,
    groups: { [EVENT_SYNC_WORKFLOW]: { mode: 'serial' } },
  });

  let resolveBulkStarted;
  let releaseBulkUpsert;
  const bulkStarted = new Promise((resolve) => {
    resolveBulkStarted = resolve;
  });
  const bulkUpsertReleased = new Promise((resolve) => {
    releaseBulkUpsert = resolve;
  });
  let queuedTaskId = null;

  const cacheStore = createCacheStore();
  const service = new PolymarketMarketService({
    apiClient: {
      async *streamOpenEvents() {
        yield {
          events: [{ id: 'shutdown-event', title: 'Shutdown Event', markets: [] }],
          totalEvents: 1,
        };
      },
      async *streamMarketTrades() {},
    },
    eventRepository: {
      async bulkUpsert(events) {
        resolveBulkStarted();
        await bulkUpsertReleased;
        return createBulkUpsertResult(events);
      },
      async markOpenEventsMissingFromSnapshotClosed() {
        throw new Error('Aborted sync must not enter finalization');
      },
    },
    eventSyncWorkflowScheduler: {
      async enqueuePolymarketEventSync(input) {
        const task = await runtime.enqueue({
          type: EVENT_SYNC_WORKFLOW,
          groupKey: EVENT_SYNC_WORKFLOW,
          payload: input,
          maxAttempts: 3,
        });
        queuedTaskId = task.id;
      },
      async cancelPolymarketEventSync() {
        await runtime.cancelGroup(EVENT_SYNC_WORKFLOW);
      },
    },
    metaRepository: {
      async getMetaValue() {
        return null;
      },
      async setMetaValue() {},
      async setLastEventSyncTime() {
        throw new Error('Aborted sync must not update the last sync time');
      },
    },
    marketTradeRepositoryFactory: createUnusedMarketTradeRepository,
    cacheStore,
    listCacheStore: { ...cacheStore, clear() {} },
    listCacheTtlMsProvider: () => 60_000,
  });

  runtime.register(
    EVENT_SYNC_WORKFLOW,
    async (context) => service.runEventSyncWorkflow(context.payload, context.signal),
    { cancelOnStop: true },
  );
  runtime.start();
  await service.startEventSync();
  await withTimeout(bulkStarted, 'event sync bulk write start');

  let shutdownSettled = false;
  const eventSyncStopping = service.shutdownEventSync();
  const workflowStopping = runtime.stop().then(() => {
    shutdownSettled = true;
  });
  await Promise.resolve();
  assert.equal(shutdownSettled, false, 'Workflow stop did not wait for the active event sync');

  releaseBulkUpsert();
  await withTimeout(
    Promise.all([eventSyncStopping, workflowStopping]),
    'event sync workflow shutdown',
  );

  assert.ok(queuedTaskId, 'Shutdown workflow task was not persisted');
  const record = await workflowRepository.get(queuedTaskId);
  assert.equal(record.status, 'canceled', 'Aborted workflow was not marked canceled');
  assert.equal(record.lockedAt, null, 'Canceled workflow retained lockedAt');
  assert.equal(record.lockedBy, null, 'Canceled workflow retained lockedBy');
  assert.ok(record.finishedAt, 'Canceled workflow did not record finishedAt');
}

async function verifyStopCancelsQueuedSyncs(workflowRepository) {
  const runtime = new WorkflowRuntime({
    repository: workflowRepository,
    pollIntervalMs: 10,
    groups: { [EVENT_SYNC_WORKFLOW]: { mode: 'serial' } },
  });
  let handlerRunCount = 0;
  let lateTaskId = null;
  let nextTaskId = null;
  let enqueueCount = 0;
  let resolveEnqueueStarted;
  let releaseEnqueue;
  const enqueueStarted = new Promise((resolve) => {
    resolveEnqueueStarted = resolve;
  });
  const enqueueReleased = new Promise((resolve) => {
    releaseEnqueue = resolve;
  });
  const cacheStore = createCacheStore();
  const service = new PolymarketMarketService({
    apiClient: {
      async *streamOpenEvents() {},
      async *streamMarketTrades() {},
    },
    eventRepository: {
      async bulkUpsert(events) {
        return createBulkUpsertResult(events);
      },
      async markOpenEventsMissingFromSnapshotClosed() {
        return 0;
      },
    },
    eventSyncWorkflowScheduler: {
      async enqueuePolymarketEventSync(input) {
        enqueueCount += 1;
        if (enqueueCount === 1) {
          resolveEnqueueStarted();
          await enqueueReleased;
        }
        const task = await runtime.enqueue({
          type: EVENT_SYNC_WORKFLOW,
          groupKey: EVENT_SYNC_WORKFLOW,
          payload: input,
          maxAttempts: 3,
        });
        if (enqueueCount === 1) {
          lateTaskId = task.id;
        } else {
          nextTaskId = task.id;
        }
      },
      async cancelPolymarketEventSync() {
        await runtime.cancelGroup(EVENT_SYNC_WORKFLOW);
      },
    },
    metaRepository: {
      async getMetaValue() {
        return null;
      },
      async setMetaValue() {},
      async setLastEventSyncTime() {},
    },
    marketTradeRepositoryFactory: createUnusedMarketTradeRepository,
    cacheStore,
    listCacheStore: { ...cacheStore, clear() {} },
    listCacheTtlMsProvider: () => 60_000,
  });

  runtime.register(
    EVENT_SYNC_WORKFLOW,
    async () => {
      handlerRunCount += 1;
    },
    { cancelOnStop: true },
  );

  const pendingTask = await runtime.enqueue({
    type: EVENT_SYNC_WORKFLOW,
    groupKey: EVENT_SYNC_WORKFLOW,
    payload: { locale: 'en-US', trigger: 'startup' },
    maxAttempts: 3,
  });
  const retryTask = await runtime.enqueue({
    type: EVENT_SYNC_WORKFLOW,
    groupKey: EVENT_SYNC_WORKFLOW,
    payload: { locale: 'en-US', trigger: 'schedule' },
    maxAttempts: 3,
  });
  await workflowRepository.update(retryTask.id, {
    status: 'retry_scheduled',
    errorMessage: 'retry fixture',
    nextRunAt: new Date(0).toISOString(),
  });

  const delayedEnqueue = service.startEventSync();
  await withTimeout(enqueueStarted, 'delayed event sync enqueue start');
  let stopSettled = false;
  const stopPromise = service.stopEventSync().then(() => {
    stopSettled = true;
  });
  const nextEnqueue = service.startEventSync();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(stopSettled, false, 'Stop overtook an earlier event sync enqueue');

  releaseEnqueue();
  await withTimeout(
    Promise.all([delayedEnqueue, stopPromise, nextEnqueue]),
    'serialized event sync cancellation',
  );

  assert.equal(
    (await workflowRepository.get(pendingTask.id)).status,
    'canceled',
    'Pending event sync was not canceled',
  );
  assert.equal(
    (await workflowRepository.get(retryTask.id)).status,
    'canceled',
    'Retry-scheduled event sync was not canceled',
  );

  assert.ok(lateTaskId, 'Delayed event sync task was not created');
  assert.equal(
    (await workflowRepository.get(lateTaskId)).status,
    'canceled',
    'Event sync enqueued during cancellation was left runnable',
  );
  assert.ok(nextTaskId, 'Event sync queued after stop was not created');
  assert.equal(
    (await workflowRepository.get(nextTaskId)).status,
    'pending',
    'A new event sync was canceled by an older enqueue request',
  );

  runtime.start();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(handlerRunCount, 1, 'The event sync queued after stop did not run exactly once');
  assert.equal(
    (await workflowRepository.get(nextTaskId)).status,
    'succeeded',
    'The event sync queued after stop did not succeed',
  );
  await runtime.stop();
}

async function verifyRuntimeStopLeavesPersistentWorkflowRunning(workflowRepository) {
  const runtime = new WorkflowRuntime({
    repository: workflowRepository,
    pollIntervalMs: 10,
    groups: { [PERSISTENT_WORKFLOW]: { mode: 'serial' } },
  });
  let resolveHandlerStarted;
  let releaseHandler;
  let handlerSettled = false;
  let handlerSignal = null;
  const handlerStarted = new Promise((resolve) => {
    resolveHandlerStarted = resolve;
  });
  const handlerReleased = new Promise((resolve) => {
    releaseHandler = resolve;
  });

  runtime.register(PERSISTENT_WORKFLOW, async (context) => {
    handlerSignal = context.signal;
    resolveHandlerStarted();
    await handlerReleased;
    handlerSettled = true;
    return { completed: true };
  });
  runtime.start();
  const task = await runtime.enqueue({
    type: PERSISTENT_WORKFLOW,
    groupKey: PERSISTENT_WORKFLOW,
    payload: { fixture: true },
    maxAttempts: 1,
  });
  await withTimeout(handlerStarted, 'persistent workflow handler start');

  await withTimeout(runtime.stop(), 'workflow runtime selective stop');
  assert.equal(handlerSettled, false, 'Runtime stop waited for a persistent workflow handler');
  assert.equal(handlerSignal?.aborted, false, 'Runtime stop aborted a persistent workflow handler');
  assert.equal(
    (await workflowRepository.get(task.id)).status,
    'running',
    'Runtime stop changed the active persistent workflow status',
  );

  releaseHandler();
  await withTimeout(
    (async () => {
      while ((await workflowRepository.get(task.id)).status !== 'succeeded') {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    })(),
    'persistent workflow completion',
  );
}

async function verifyStopWaitsForFinalization(workflowRepository) {
  const runtime = new WorkflowRuntime({
    repository: workflowRepository,
    pollIntervalMs: 10,
    groups: { [EVENT_SYNC_WORKFLOW]: { mode: 'serial' } },
  });
  let queuedTaskId = null;
  let setLastSyncTimeCount = 0;
  let resolveFinalizationStarted;
  let releaseFinalization;
  const finalizationStarted = new Promise((resolve) => {
    resolveFinalizationStarted = resolve;
  });
  const finalizationReleased = new Promise((resolve) => {
    releaseFinalization = resolve;
  });
  const cacheStore = createCacheStore();
  const service = new PolymarketMarketService({
    apiClient: {
      async *streamOpenEvents() {
        yield {
          events: [{ id: 'finalizing-event', title: 'Finalizing Event', markets: [] }],
          totalEvents: 1,
        };
      },
      async *streamMarketTrades() {},
    },
    eventRepository: {
      async bulkUpsert(events) {
        return createBulkUpsertResult(events);
      },
      async markOpenEventsMissingFromSnapshotClosed() {
        resolveFinalizationStarted();
        await finalizationReleased;
        return 1;
      },
    },
    eventSyncWorkflowScheduler: {
      async enqueuePolymarketEventSync(input) {
        const task = await runtime.enqueue({
          type: EVENT_SYNC_WORKFLOW,
          groupKey: EVENT_SYNC_WORKFLOW,
          payload: input,
          maxAttempts: 3,
        });
        queuedTaskId = task.id;
      },
      async cancelPolymarketEventSync() {
        await runtime.cancelGroup(EVENT_SYNC_WORKFLOW);
      },
    },
    metaRepository: {
      async getMetaValue() {
        return null;
      },
      async setMetaValue() {},
      async setLastEventSyncTime() {
        setLastSyncTimeCount += 1;
      },
    },
    marketTradeRepositoryFactory: createUnusedMarketTradeRepository,
    cacheStore,
    listCacheStore: { ...cacheStore, clear() {} },
    listCacheTtlMsProvider: () => 60_000,
  });
  const statuses = [];
  service.on('event-sync-status', (status) => statuses.push(status.state));

  runtime.register(
    EVENT_SYNC_WORKFLOW,
    async (context) => service.runEventSyncWorkflow(context.payload, context.signal),
    { cancelOnStop: true },
  );
  runtime.start();
  await service.startEventSync();
  await withTimeout(finalizationStarted, 'event sync finalization start');

  let stopSettled = false;
  const stopPromise = service.stopEventSync().then(() => {
    stopSettled = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(stopSettled, false, 'Event sync stop resolved before finalization completed');

  releaseFinalization();
  await withTimeout(stopPromise, 'event sync finalization stop');
  assert.ok(queuedTaskId, 'Finalizing workflow task was not persisted');
  const task = await workflowRepository.get(queuedTaskId);
  assert.equal(task.status, 'succeeded', 'Finalizing workflow was canceled instead of succeeded');
  assert.ok(task.finishedAt, 'Succeeded finalizing workflow did not record finishedAt');
  assert.equal(setLastSyncTimeCount, 1, 'Finalizing sync did not update the last sync time');
  assert.equal(statuses.at(-1), 'done', 'Finalizing sync did not finish with done');
  assert.equal(statuses.includes('aborted'), false, 'Finalizing sync emitted aborted after stop');
  await runtime.stop();
}

async function main() {
  const userDataPath = await mkdtemp(path.join(os.tmpdir(), 'polytrader-event-sync-shutdown-'));
  let databaseOpen = false;
  try {
    await initDb({ userDataPath, migrationsFolder });
    databaseOpen = true;
    const workflowRepository = createSqliteWorkflowTaskRepository();
    await verifyShutdownCancelsActiveSync(workflowRepository);
    await verifyStopCancelsQueuedSyncs(workflowRepository);
    await verifyStopWaitsForFinalization(workflowRepository);
    await verifyRuntimeStopLeavesPersistentWorkflowRunning(workflowRepository);

    await closeDb();
    databaseOpen = false;
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(unexpectedErrors, [], 'Shutdown leaked a process-level error');
    console.log('Event sync shutdown smoke test passed');
  } finally {
    if (databaseOpen) await closeDb();
    await rm(userDataPath, { recursive: true, force: true });
  }
}

process.on('uncaughtException', recordUncaughtException);
process.on('unhandledRejection', recordUnhandledRejection);
try {
  await main();
} finally {
  process.off('uncaughtException', recordUncaughtException);
  process.off('unhandledRejection', recordUnhandledRejection);
}
