import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { PolymarketApiClient } from '@polytrader/polymarket-api';

const events = [
  { id: 'event-1', title: 'First event', markets: [] },
  { id: 'event-2', title: 'Second event', markets: [] },
];
const ndjson = Buffer.from(`${events.map((event) => JSON.stringify(event)).join('\n')}\n`);
const abortNdjson = Buffer.from(`${JSON.stringify(events[0])}\n`);
const originalFetch = globalThis.fetch;
const apiClient = PolymarketApiClient.getInstance();
const unexpectedErrors = [];

function recordUncaughtException(error) {
  unexpectedErrors.push(`uncaughtException: ${formatError(error)}`);
}

function recordUnhandledRejection(error) {
  unexpectedErrors.push(`unhandledRejection: ${formatError(error)}`);
}

async function runCase({ name, compressed, contentEncoding, splitFirstByte = false }) {
  const snapshotBody = compressed ? gzipSync(ndjson) : ndjson;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/polymarket-gamma/latest.json')) {
      return Response.json({
        snapshot: {
          key: 'polymarket-gamma/test/events.ndjson.gz',
          eventCount: events.length,
        },
      });
    }
    if (!url.endsWith('/polymarket-gamma/test/events.ndjson.gz')) {
      throw new Error(`Unexpected smoke test URL: ${url}`);
    }

    const headers = new Headers({ 'content-type': 'application/x-ndjson' });
    if (contentEncoding) headers.set('content-encoding', contentEncoding);
    const body = splitFirstByte ? splitBodyAfterFirstByte(snapshotBody) : snapshotBody;
    return new Response(body, { headers });
  };

  const received = [];
  for await (const page of apiClient.streamOpenEvents(new AbortController().signal, 'en-US', 1)) {
    received.push(...page.events);
    assert.equal(page.totalEvents, events.length, `${name}: unexpected totalEvents`);
  }
  assert.deepEqual(received, events, `${name}: decoded events did not match`);
}

async function runAbortCase({ name, compressed }) {
  const snapshotBody = compressed ? gzipSync(abortNdjson) : abortNdjson;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/polymarket-gamma/latest.json')) {
      return Response.json({
        snapshot: {
          key: 'polymarket-gamma/test/hanging.ndjson.gz',
          eventCount: 1,
        },
      });
    }
    if (!url.endsWith('/polymarket-gamma/test/hanging.ndjson.gz')) {
      throw new Error(`Unexpected abort smoke test URL: ${url}`);
    }

    return new Response(createHangingBody(snapshotBody), {
      headers: new Headers({ 'content-type': 'application/x-ndjson' }),
    });
  };

  const controller = new AbortController();
  const iterator = apiClient
    .streamOpenEvents(controller.signal, 'en-US', 1)
    [Symbol.asyncIterator]();
  const firstPage = await withTimeout(iterator.next(), `${name}: first page`);
  assert.equal(firstPage.done, false, `${name}: stream ended before yielding a page`);
  assert.deepEqual(firstPage.value.events, [events[0]], `${name}: unexpected first page`);

  const pendingPage = iterator.next();
  controller.abort();
  await assert.rejects(
    withTimeout(pendingPage, `${name}: abort`),
    (error) => error instanceof Error && error.name === 'AbortError',
    `${name}: generator did not reject with AbortError`,
  );
}

function splitBodyAfterFirstByte(value) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(value.subarray(0, 1));
      controller.enqueue(value.subarray(1));
      controller.close();
    },
  });
}

function createHangingBody(value) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(value);
    },
  });
}

function withTimeout(promise, name) {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${name} timed out`)), 1_000);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

function formatError(error) {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

async function settleEventLoop() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

process.on('uncaughtException', recordUncaughtException);
process.on('unhandledRejection', recordUnhandledRejection);
try {
  await runCase({ name: 'plain body without content encoding', compressed: false });
  await runCase({
    name: 'plain body with gzip content encoding',
    compressed: false,
    contentEncoding: 'gzip',
  });
  await runCase({
    name: 'gzip body without content encoding',
    compressed: true,
    splitFirstByte: true,
  });
  await runCase({
    name: 'gzip body with gzip content encoding',
    compressed: true,
    contentEncoding: 'gzip',
  });
  await runAbortCase({ name: 'hanging plain body abort', compressed: false });
  await runAbortCase({ name: 'hanging gzip body abort', compressed: true });
  await settleEventLoop();
  assert.deepEqual(unexpectedErrors, [], 'abort leaked an unexpected process-level error');
  console.log('R2 event snapshot magic-byte and abort smoke test passed');
} finally {
  globalThis.fetch = originalFetch;
  process.off('uncaughtException', recordUncaughtException);
  process.off('unhandledRejection', recordUnhandledRejection);
}
