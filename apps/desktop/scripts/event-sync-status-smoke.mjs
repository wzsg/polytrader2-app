import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PolymarketApiClient } from '@polytrader/polymarket-api';
import { PolymarketMarketService } from '@polytrader/polymarket-market';
import {
  closeDb,
  createSqliteEventRepository,
  createSqliteMetaRepository,
  initDb,
} from '@polytrader/sqlite-repository';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const migrationsFolder = path.join(workspaceRoot, 'apps', 'desktop', 'drizzle');

function readBatchSize(argv) {
  const index = argv.indexOf('--batch-size');
  if (index < 0) return 500;
  const value = Number(argv[index + 1]);
  if (!Number.isFinite(value)) throw new Error('--batch-size must be a finite number');
  return Math.max(0, Math.min(5_000, Math.trunc(value)));
}

async function main() {
  const batchSize = readBatchSize(process.argv.slice(2));
  const userDataPath = await mkdtemp(path.join(os.tmpdir(), 'polytrader-event-sync-status-'));
  try {
    await initDb({ userDataPath, migrationsFolder });
    const apiClient = PolymarketApiClient.getInstance();
    const service = new PolymarketMarketService({
      apiClient,
      cacheStore: {
        getOrSetValue: async (_key, _ttlMs, loader) => await loader(),
      },
      eventRepository: createSqliteEventRepository(),
      eventSyncWorkflowScheduler: {
        enqueuePolymarketEventSync: async () => undefined,
        cancelPolymarketEventSync: async () => undefined,
      },
      marketTradeRepositoryFactory: () => {
        throw new Error('Market trade repository is not used by this smoke test');
      },
      metaRepository: createSqliteMetaRepository(),
    });
    const statuses = [];
    service.on('event-sync-status', (status) => statuses.push(status));
    service.setEventSyncBatchSize(batchSize);

    const result = await service.runEventSyncWorkflow(
      { locale: 'en-US', trigger: 'manual' },
      new AbortController().signal,
    );
    const syncingStatuses = statuses.filter((status) => status.state === 'syncing');
    const finalizingStatus = statuses.find((status) => status.state === 'finalizing');
    const doneStatus = statuses.find((status) => status.state === 'done');
    const progressValues = syncingStatuses
      .map((status) => status.progressPercent ?? -1)
      .filter((progress) => progress >= 0);
    const totalEvents = doneStatus?.totalEvents;

    if (!totalEvents || totalEvents !== result.eventsFetched) {
      throw new Error(`Unexpected completed event count: ${totalEvents} / ${result.eventsFetched}`);
    }
    if (finalizingStatus?.progressPercent !== 100 || doneStatus?.progressPercent !== 100) {
      throw new Error('Finalizing and done statuses must report 100% progress');
    }
    if (
      progressValues.some((progress, index) => index > 0 && progress < progressValues[index - 1])
    ) {
      throw new Error('Sync progress must not decrease');
    }

    console.log(
      JSON.stringify(
        {
          eventsFetched: result.eventsFetched,
          pagesFetched: result.pagesFetched,
          batchSize,
          statusCount: statuses.length,
          firstStatus: statuses[0],
          firstProgressStatus: syncingStatuses.find((status) => status.totalEvents !== undefined),
          finalizingStatus,
          doneStatus,
        },
        null,
        2,
      ),
    );
  } finally {
    await closeDb();
    await rm(userDataPath, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
