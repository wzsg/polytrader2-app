import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { PolymarketApiClient } from '@polytrader/polymarket-api';
import { closeDb, createSqliteEventRepository, initDb } from '@polytrader/sqlite-repository';

const DEFAULT_BATCH_SIZES = [100, 250, 500];
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const migrationsFolder = path.join(workspaceRoot, 'apps', 'desktop', 'drizzle');

function formatMs(value) {
  return `${value.toFixed(0)} ms`;
}

function memoryMiB(bytes) {
  return Number((bytes / 1024 / 1024).toFixed(1));
}

function createMemorySampler() {
  let peak = process.memoryUsage();
  const baseline = peak;
  return {
    baseline,
    sample() {
      const current = process.memoryUsage();
      peak = {
        rss: Math.max(peak.rss, current.rss),
        heapTotal: Math.max(peak.heapTotal, current.heapTotal),
        heapUsed: Math.max(peak.heapUsed, current.heapUsed),
        external: Math.max(peak.external, current.external),
        arrayBuffers: Math.max(peak.arrayBuffers, current.arrayBuffers),
      };
    },
    result() {
      return {
        baselineRssMiB: memoryMiB(baseline.rss),
        peakRssMiB: memoryMiB(peak.rss),
        peakHeapUsedMiB: memoryMiB(peak.heapUsed),
        peakExternalMiB: memoryMiB(peak.external),
        peakArrayBuffersMiB: memoryMiB(peak.arrayBuffers),
      };
    },
  };
}

function snapshotSummary(events, batchSize) {
  return {
    events: events.length,
    markets: events.reduce((total, event) => total + (event.markets?.length ?? 0), 0),
    batches: Math.ceil(events.length / batchSize),
    jsonMiB: Number((Buffer.byteLength(JSON.stringify(events)) / 1024 / 1024).toFixed(1)),
  };
}

async function withIsolatedDatabase(label, fn) {
  const userDataPath = await mkdtemp(path.join(os.tmpdir(), `polytrader-event-sync-${label}-`));
  try {
    await initDb({ userDataPath, migrationsFolder });
    return await fn(createSqliteEventRepository());
  } finally {
    await closeDb();
    await rm(userDataPath, { recursive: true, force: true });
  }
}

async function downloadSnapshot(client) {
  const controller = new AbortController();
  const startedAt = performance.now();
  const pages = [];
  for await (const page of client.streamOpenEvents(controller.signal, 'en-US')) {
    pages.push(page.events);
  }
  return { pages, downloadMs: performance.now() - startedAt };
}

async function streamAndWrite(pages, batchSize, downloadMs) {
  return withIsolatedDatabase(`streamed-${batchSize}`, async (repository) => {
    const startedAt = performance.now();
    let events = 0;
    let writes = 0;
    let pending = [];
    for (const pageEvents of pages) {
      events += pageEvents.length;
      pending.push(...pageEvents);
      while (pending.length >= batchSize) {
        await repository.bulkUpsert(pending.slice(0, batchSize), 'en-US');
        writes += 1;
        pending = pending.slice(batchSize);
      }
    }
    if (pending.length) {
      await repository.bulkUpsert(pending, 'en-US');
      writes += 1;
    }
    const writeMs = performance.now() - startedAt;
    return { batchSize, events, writes, writeMs, totalMs: downloadMs + writeMs };
  });
}

async function profileLiveStreamAndWrite(client, batchSize) {
  const controller = new AbortController();
  const memory = createMemorySampler();
  return withIsolatedDatabase(`live-${batchSize}`, async (repository) => {
    const startedAt = performance.now();
    let events = 0;
    let writes = 0;
    let pending = [];
    for await (const page of client.streamOpenEvents(controller.signal, 'en-US')) {
      events += page.events.length;
      pending.push(...page.events);
      memory.sample();
      while (pending.length >= batchSize) {
        await repository.bulkUpsert(pending.slice(0, batchSize), 'en-US');
        writes += 1;
        pending = pending.slice(batchSize);
        memory.sample();
      }
    }
    if (pending.length) {
      await repository.bulkUpsert(pending, 'en-US');
      writes += 1;
      memory.sample();
    }
    return {
      batchSize,
      events,
      writes,
      totalMs: performance.now() - startedAt,
      memory: memory.result(),
    };
  });
}

async function downloadThenWrite(events, downloadMs) {
  const writeMs = await withIsolatedDatabase('single', async (repository) => {
    const startedAt = performance.now();
    await repository.bulkUpsert(events, 'en-US');
    return performance.now() - startedAt;
  });
  return {
    ...snapshotSummary(events, events.length),
    downloadMs,
    writeMs,
    totalMs: downloadMs + writeMs,
  };
}

async function main() {
  const client = PolymarketApiClient.getInstance();
  console.log('Event sync write benchmark (Electron runtime)');
  console.log('Each strategy uses a separate temporary SQLite database.');
  if (process.argv.includes('--live-only')) {
    const liveBatch500 = await profileLiveStreamAndWrite(client, 500);
    console.log(
      `live streamed batch 500: ${liveBatch500.events} events / ${liveBatch500.writes} writes in ${formatMs(liveBatch500.totalMs)}`,
    );
    console.log(JSON.stringify(liveBatch500, null, 2));
    return;
  }
  const { pages, downloadMs } = await downloadSnapshot(client);
  const events = pages.flat();
  console.log(`snapshot download: ${formatMs(downloadMs)}, ${events.length} events`);

  const streamed = [];
  for (const batchSize of DEFAULT_BATCH_SIZES) {
    const result = await streamAndWrite(pages, batchSize, downloadMs);
    streamed.push(result);
    console.log(
      `streamed batch ${batchSize}: ${result.events} events / ${result.writes} writes in ${formatMs(result.totalMs)} (write ${formatMs(result.writeMs)})`,
    );
  }

  const single = await downloadThenWrite(events, downloadMs);
  console.log(
    `single: ${single.events} events / ${single.markets} markets / ${single.jsonMiB} MiB in ${formatMs(single.totalMs)}`,
  );
  console.log(
    `  download ${formatMs(single.downloadMs)}, one SQLite write ${formatMs(single.writeMs)}`,
  );
  const liveBatch500 = await profileLiveStreamAndWrite(client, 500);
  console.log(
    `live streamed batch 500: ${liveBatch500.events} events / ${liveBatch500.writes} writes in ${formatMs(liveBatch500.totalMs)}`,
  );
  console.log(
    `  sampled peak RSS ${liveBatch500.memory.peakRssMiB} MiB, heap used ${liveBatch500.memory.peakHeapUsedMiB} MiB`,
  );
  console.log(
    JSON.stringify(
      {
        snapshot: {
          events: single.events,
          markets: single.markets,
          batches: single.batches,
          jsonMiB: single.jsonMiB,
        },
        streamed,
        downloadThenSingleWrite: single,
        liveBatch500,
        comparedWithBatch100: {
          totalDifferenceMs: Math.round(single.totalMs - streamed[0].totalMs),
          totalDifferencePercent: Number(
            (((single.totalMs - streamed[0].totalMs) / streamed[0].totalMs) * 100).toFixed(1),
          ),
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
