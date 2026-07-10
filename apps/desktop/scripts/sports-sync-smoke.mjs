import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  closeDb,
  createSqliteEventRepository,
  createSqliteMetaRepository,
  initDb,
} from '@polytrader/sqlite-repository';
import { PolymarketApiClient } from '@polytrader/polymarket-api';
import { PolymarketMarketService } from '@polytrader/polymarket-market';
import { KvStore } from '@polytrader/kv-store';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const defaultUserDataPath = path.join(os.homedir(), 'AppData', 'Roaming', 'polytrader2');
const defaultMigrationsFolder = path.join(workspaceRoot, 'apps', 'desktop', 'drizzle');

function parseArgs(argv) {
  const options = {
    userDataPath: defaultUserDataPath,
    migrationsFolder: defaultMigrationsFolder,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--user-data-path' && next) {
      options.userDataPath = path.resolve(next);
      i += 1;
    } else if (arg === '--migrations-folder' && next) {
      options.migrationsFolder = path.resolve(next);
      i += 1;
    }
  }

  return options;
}

function createStubWorkflowScheduler() {
  return {
    enqueuePolymarketEventSync: async () => undefined,
  };
}

function createStubMarketTradeRepositoryFactory() {
  return () => {
    throw new Error('This smoke test does not exercise market trade repositories.');
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  console.log(`userDataPath: ${options.userDataPath}`);

  await initDb({
    userDataPath: options.userDataPath,
    migrationsFolder: options.migrationsFolder,
  });

  const eventRepository = createSqliteEventRepository();
  const metaRepository = createSqliteMetaRepository();
  const cacheStore = new KvStore({ storeFile: 'sports-sync-smoke-kv.json' });
  await cacheStore.initialize(options.userDataPath);
  const apiClient = PolymarketApiClient.getInstance();
  const service = new PolymarketMarketService({
    apiClient,
    eventRepository,
    metaRepository,
    eventSyncWorkflowScheduler: createStubWorkflowScheduler(),
    marketTradeRepositoryFactory: createStubMarketTradeRepositoryFactory(),
    cacheStore,
  });

  const syncResult = await service.runEventSyncWorkflow(
    { locale: 'zh-CN', trigger: 'manual' },
    new AbortController().signal,
  );
  service.setCategoryConfigLocale('zh-CN');
  const category = await service.fetchSportsCategory();
  const discipline = category.disciplines?.find((item) => item.leagues?.length);
  const league = discipline?.leagues?.find((item) => item.openEventCount > 0);
  if (!discipline || !league) throw new Error('Sports category API did not return an active league');
  if (!league.shortName) throw new Error('Sports category API did not return a league short name');

  const baseParams = {
    status: 'active',
    excludeEnded: true,
    sortField: 'start_time',
    sortOrder: 'asc',
    limit: 20,
    offset: 0,
  };
  const [allSports, disciplineSports, leagueSports] = await Promise.all([
    eventRepository.listEvents({ ...baseParams, requireSportId: true }),
    eventRepository.listEvents({
      ...baseParams,
      sportIds: discipline.leagues.map((item) => String(item.id)),
    }),
    eventRepository.listEvents({ ...baseParams, sportId: String(league.id) }),
  ]);
  const [allSportsCount, disciplineSportsCount, leagueSportsCount] = await Promise.all([
    eventRepository.countEvents({ ...baseParams, requireSportId: true }),
    eventRepository.countEvents({
      ...baseParams,
      sportIds: discipline.leagues.map((item) => String(item.id)),
    }),
    eventRepository.countEvents({ ...baseParams, sportId: String(league.id) }),
  ]);

  console.log(
    JSON.stringify(
      {
        syncResult,
        allSports: { count: allSportsCount, returned: allSports.length },
        discipline: {
          code: discipline.code,
          name: discipline.name,
          count: disciplineSportsCount,
          returned: disciplineSports.length,
        },
        league: {
          id: String(league.id),
          name: league.name,
          shortName: league.shortName,
          count: leagueSportsCount,
          returned: leagueSports.length,
        },
      },
      null,
      2,
    ),
  );

  if (!allSportsCount || !disciplineSportsCount || !leagueSportsCount) {
    throw new Error('Sports list or one of its filters returned no events');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
