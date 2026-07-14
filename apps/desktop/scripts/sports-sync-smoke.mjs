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
import { FileCacheStore } from '@polytrader/cache-store';

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
  const cacheStore = new FileCacheStore({ storeFile: 'sports-sync-smoke-cache.json' });
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

  const startTimeAfter = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const baseParams = {
    status: 'active',
    excludeEnded: true,
    startTimeAfter,
    sortField: 'start_time',
    sortOrder: 'asc',
    limit: 20,
    offset: 0,
  };
  const visibleSports = await eventRepository.listEvents({
    ...baseParams,
    requireSportId: true,
    limit: 500,
  });
  const allSports = visibleSports.slice(0, baseParams.limit);
  const allSportsCount = await eventRepository.countEvents({ ...baseParams, requireSportId: true });
  const visibleSportIds = new Set(visibleSports.map((event) => event.sportId).filter(Boolean));
  const visibleLeague = category.disciplines
    ?.flatMap((disciplineItem) =>
      disciplineItem.leagues.map((leagueItem) => ({
        discipline: disciplineItem,
        league: leagueItem,
      })),
    )
    .find(({ league: leagueItem }) => visibleSportIds.has(String(leagueItem.id)));
  if (!visibleLeague) throw new Error('Sports category API did not return a visible league');

  const { discipline, league } = visibleLeague;
  if (!league.shortName) throw new Error('Sports category API did not return a league short name');
  const [disciplineSports, leagueSports] = await Promise.all([
    eventRepository.listEvents({
      ...baseParams,
      sportIds: discipline.leagues.map((item) => String(item.id)),
    }),
    eventRepository.listEvents({ ...baseParams, sportId: String(league.id) }),
  ]);
  const [disciplineSportsCount, leagueSportsCount] = await Promise.all([
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

  const cutoff = new Date(startTimeAfter).getTime();
  const expiredEvent = [...allSports, ...disciplineSports, ...leagueSports].find((event) => {
    const startTime = event.start_time ? new Date(event.start_time).getTime() : Number.NaN;
    return Number.isFinite(startTime) && startTime < cutoff;
  });
  if (expiredEvent) {
    throw new Error(`Sports list included an event older than 24 hours: ${expiredEvent.id}`);
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
