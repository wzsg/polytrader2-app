import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import {
  closeDb,
  createSqliteEventRepository,
  createSqliteMetaRepository,
  initDb,
} from '@polytrader/sqlite-repository';
import { KvStore } from '@polytrader/kv-store';
import { PolymarketMarketService } from '@polytrader/polymarket-market';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const defaultUserDataPath = path.join(os.homedir(), 'AppData', 'Roaming', 'polytrader2');
const defaultMigrationsFolder = path.join(workspaceRoot, 'apps', 'desktop', 'drizzle');

function parseArgs(argv) {
  const options = {
    userDataPath: defaultUserDataPath,
    migrationsFolder: defaultMigrationsFolder,
    tagIds: ['21'],
    iterations: 10,
    warmups: 2,
    limit: 50,
    offset: 0,
    status: 'active',
    startTimeMinutes: 0,
    sortField: 'end_date',
    sortOrder: 'asc',
    includeConfig: false,
    coldConfigCache: false,
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
    } else if (arg === '--tag-ids' && next) {
      options.tagIds = next
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
      i += 1;
    } else if (arg === '--iterations' && next) {
      options.iterations = Math.max(1, Number.parseInt(next, 10) || options.iterations);
      i += 1;
    } else if (arg === '--warmups' && next) {
      options.warmups = Math.max(0, Number.parseInt(next, 10) || 0);
      i += 1;
    } else if (arg === '--limit' && next) {
      options.limit = Math.max(1, Number.parseInt(next, 10) || options.limit);
      i += 1;
    } else if (arg === '--offset' && next) {
      options.offset = Math.max(0, Number.parseInt(next, 10) || 0);
      i += 1;
    } else if (arg === '--status' && next) {
      options.status = next;
      i += 1;
    } else if (arg === '--start-time-minutes' && next) {
      options.startTimeMinutes = Math.max(0, Number.parseInt(next, 10) || 0);
      i += 1;
    } else if (arg === '--sort-field' && next) {
      options.sortField = next;
      i += 1;
    } else if (arg === '--sort-order' && next) {
      options.sortOrder = next === 'desc' ? 'desc' : 'asc';
      i += 1;
    } else if (arg === '--include-config') {
      options.includeConfig = true;
    } else if (arg === '--cold-config-cache') {
      options.coldConfigCache = true;
      options.includeConfig = true;
    } else if (arg === '--help') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Usage:
  pnpm --filter @polytrader2/app run smoke:crypto-events -- [options]

Options:
  --tag-ids 21,123          Crypto/event tag ids to test. Defaults to 21.
  --iterations 10           Measured iterations. Defaults to 10.
  --warmups 2               Warmup iterations before measuring. Defaults to 2.
  --limit 50                Page size. Defaults to 50.
  --offset 0                Page offset. Defaults to 0.
  --status active           Event status filter. Defaults to active.
  --start-time-minutes 5    Active market freshness window. Defaults to 0.
  --sort-field end_date     Sort field. Defaults to end_date.
  --sort-order asc          Sort order. Defaults to asc.
  --include-config          Include fetchCryptoCategory timing.
  --cold-config-cache       Delete crypto-category cache before measuring config fetch.
  --user-data-path PATH     App userData folder. Defaults to %APPDATA%\\polytrader2.
`);
}

function createStubApiClient() {
  const unused = async () => {
    throw new Error('This smoke test does not exercise remote API methods.');
  };
  return {
    fetchEventDetail: unused,
    fetchMarketTrades: unused,
    streamMarketTrades: unused,
    streamOpenEvents: unused,
  };
}

function createStubWorkflowScheduler() {
  return {
    enqueueWorkflow: async () => undefined,
  };
}

function createStubMarketTradeRepositoryFactory() {
  return () => {
    throw new Error('This smoke test does not exercise market trade repositories.');
  };
}

function buildCryptoParams(options) {
  return {
    tagIds: options.tagIds,
    status: options.status,
    startTimeMinutes: options.startTimeMinutes,
    sortField: options.sortField,
    sortOrder: options.sortOrder,
    limit: options.limit,
    offset: options.offset,
  };
}

function buildEventParams(options) {
  return {
    status: options.status,
    sortField: options.sortField === 'end_date' ? 'volume24hr' : options.sortField,
    sortOrder: options.sortField === 'end_date' ? 'desc' : options.sortOrder,
    limit: options.limit,
    offset: options.offset,
  };
}

async function timeAsync(label, fn) {
  const startedAt = performance.now();
  const value = await fn();
  return {
    label,
    ms: performance.now() - startedAt,
    value,
  };
}

async function measureSeries(label, iterations, warmups, fn) {
  for (let i = 0; i < warmups; i += 1) {
    await fn();
  }

  const samples = [];
  let lastValue;
  for (let i = 0; i < iterations; i += 1) {
    const result = await timeAsync(label, fn);
    samples.push(result.ms);
    lastValue = result.value;
  }

  return {
    label,
    ...summarize(samples),
    lastValue,
  };
}

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = samples.reduce((total, value) => total + value, 0);
  return {
    avgMs: sum / samples.length,
    minMs: sorted[0],
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    maxMs: sorted[sorted.length - 1],
  };
}

function percentile(sorted, ratio) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1);
  return sorted[index];
}

function formatMs(ms) {
  return `${ms.toFixed(2)} ms`;
}

function describeEvents(events) {
  const marketCount = events.reduce((total, event) => total + (event.markets?.length ?? 0), 0);
  return {
    events: events.length,
    markets: marketCount,
    jsonBytes: Buffer.byteLength(JSON.stringify(events)),
  };
}

function printResult(result) {
  console.log(
    [
      result.label.padEnd(36),
      `avg ${formatMs(result.avgMs)}`.padEnd(16),
      `p50 ${formatMs(result.p50Ms)}`.padEnd(16),
      `p95 ${formatMs(result.p95Ms)}`.padEnd(16),
      `min ${formatMs(result.minMs)}`.padEnd(16),
      `max ${formatMs(result.maxMs)}`,
    ].join(' '),
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  console.log('Crypto events smoke test');
  console.log(`userDataPath: ${options.userDataPath}`);
  console.log(`migrationsFolder: ${options.migrationsFolder}`);
  console.log(`tagIds: ${options.tagIds.join(', ')}`);
  console.log(
    `iterations: ${options.iterations}, warmups: ${options.warmups}, limit: ${options.limit}, offset: ${options.offset}`,
  );
  console.log(`status: ${options.status}, sort: ${options.sortField} ${options.sortOrder}`);
  console.log(`startTimeMinutes: ${options.startTimeMinutes}`);
  console.log('');

  await initDb({
    userDataPath: options.userDataPath,
    migrationsFolder: options.migrationsFolder,
  });

  const eventRepository = createSqliteEventRepository();
  const metaRepository = createSqliteMetaRepository();
  const cacheStore = new KvStore({ storeFile: 'crypto-events-smoke-kv.json' });
  await cacheStore.initialize(options.userDataPath);
  if (options.coldConfigCache) {
    await cacheStore.deleteValue('crypto-category');
  }

  const service = new PolymarketMarketService({
    apiClient: createStubApiClient(),
    eventRepository,
    metaRepository,
    eventSyncWorkflowScheduler: createStubWorkflowScheduler(),
    marketTradeRepositoryFactory: createStubMarketTradeRepositoryFactory(),
    cacheStore,
  });

  const cryptoParams = buildCryptoParams(options);
  const eventParams = buildEventParams(options);
  const results = [];

  if (options.includeConfig) {
    results.push(
      await measureSeries('service.fetchCryptoCategory', options.iterations, options.warmups, () =>
        service.fetchCryptoCategory(),
      ),
    );
  }

  results.push(
    await measureSeries('service.listCryptoEvents', options.iterations, options.warmups, () =>
      service.listCryptoEvents(cryptoParams),
    ),
  );
  results.push(
    await measureSeries('repo.listEvents crypto params', options.iterations, options.warmups, () =>
      eventRepository.listEvents(cryptoParams),
    ),
  );
  results.push(
    await measureSeries('repo.countEvents crypto params', options.iterations, options.warmups, () =>
      eventRepository.countEvents(cryptoParams),
    ),
  );
  results.push(
    await measureSeries('repo.listEvents normal params', options.iterations, options.warmups, () =>
      eventRepository.listEvents(eventParams),
    ),
  );
  results.push(
    await measureSeries('repo.countEvents normal params', options.iterations, options.warmups, () =>
      eventRepository.countEvents(eventParams),
    ),
  );

  for (const result of results) {
    printResult(result);
  }

  const cryptoResult = results.find(
    (result) => result.label === 'service.listCryptoEvents',
  )?.lastValue;
  const normalEvents = results.find(
    (result) => result.label === 'repo.listEvents normal params',
  )?.lastValue;
  if (cryptoResult) {
    console.log('');
    console.log('Crypto result shape:');
    console.log(
      JSON.stringify(
        {
          filteredCount: cryptoResult.filteredCount,
          totalCount: cryptoResult.totalCount,
          activeCount: cryptoResult.activeCount,
          ...describeEvents(cryptoResult.events),
        },
        null,
        2,
      ),
    );
  }
  if (normalEvents) {
    console.log('');
    console.log('Normal list shape:');
    console.log(JSON.stringify(describeEvents(normalEvents), null, 2));
  }

  await closeDb();
}

main().catch(async (error) => {
  try {
    await closeDb();
  } catch {
    // Ignore cleanup errors so the original failure stays visible.
  }
  console.error(error);
  process.exit(1);
});
