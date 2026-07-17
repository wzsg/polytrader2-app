import assert from 'node:assert/strict';
import { PolymarketMarketService } from '@polytrader/polymarket-market';

let resolveBulkStarted;
let releaseBulkUpsert;
const bulkStarted = new Promise((resolve) => {
  resolveBulkStarted = resolve;
});
const bulkUpsertReleased = new Promise((resolve) => {
  releaseBulkUpsert = resolve;
});

let streamRunCount = 0;
let bulkUpsertCount = 0;
let markMissingCount = 0;
let setLastSyncTimeCount = 0;

const apiClient = {
  async *streamOpenEvents() {
    streamRunCount += 1;
    yield {
      events: [{ id: `event-${streamRunCount}`, title: 'Event', markets: [] }],
      totalEvents: 1,
    };
  },
  async *streamMarketTrades() {},
};

const eventRepository = {
  async bulkUpsert(events) {
    bulkUpsertCount += 1;
    if (bulkUpsertCount === 1) {
      resolveBulkStarted();
      await bulkUpsertReleased;
    }
    return {
      received: events.length,
      eventsUpserted: events.length,
      eventsSkipped: 0,
      marketsUpserted: 0,
      tagsUpserted: 0,
    };
  },
  async markOpenEventsMissingFromSnapshotClosed() {
    markMissingCount += 1;
    return 0;
  },
};

const metaRepository = {
  async getMetaValue() {
    return null;
  },
  async setMetaValue() {},
  async setLastEventSyncTime() {
    setLastSyncTimeCount += 1;
  },
};

const cacheStore = {
  async getOrSetValue(_key, _ttlMs, loader) {
    return await loader();
  },
};

const service = new PolymarketMarketService({
  apiClient,
  eventRepository,
  eventSyncWorkflowScheduler: {
    async enqueuePolymarketEventSync() {},
    async cancelPolymarketEventSync() {},
  },
  metaRepository,
  marketTradeRepositoryFactory: () => {
    throw new Error('Market trade repository is not used by this smoke test');
  },
  cacheStore,
  listCacheStore: { ...cacheStore, clear() {} },
  listCacheTtlMsProvider: () => 60_000,
});

const statuses = [];
service.on('event-sync-status', (status) => statuses.push(status));

const abortedRun = service.runEventSyncWorkflow({ locale: 'en-US', trigger: 'manual' });
const abortedRunAssertion = assert.rejects(
  abortedRun,
  (error) => error instanceof Error && error.name === 'AbortError',
  'Event sync did not reject with AbortError',
);
await bulkStarted;

let stopSettled = false;
const stopPromise = service.stopEventSync().then(() => {
  stopSettled = true;
});
await Promise.resolve();
assert.equal(stopSettled, false, 'stopEventSync resolved before the active bulk write completed');

releaseBulkUpsert();
await Promise.all([stopPromise, abortedRunAssertion]);
assert.deepEqual(
  statuses.map((status) => status.state),
  ['syncing', 'aborted'],
  'Aborted sync emitted an unexpected status sequence',
);
assert.equal(markMissingCount, 0, 'Aborted sync entered finalization');
assert.equal(setLastSyncTimeCount, 0, 'Aborted sync updated the last sync time');

const completed = await service.runEventSyncWorkflow({ locale: 'en-US', trigger: 'manual' });
assert.equal(completed.eventsFetched, 1, 'A new sync could not complete after abort');
assert.equal(markMissingCount, 1, 'Completed sync did not finalize event state');
assert.equal(setLastSyncTimeCount, 1, 'Completed sync did not update the last sync time');
assert.equal(statuses.at(-1)?.state, 'done', 'Completed sync did not emit done');

console.log('Event sync abort smoke test passed');
