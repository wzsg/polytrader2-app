import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { PolymarketApiClient } from '@polytrader/polymarket-api';

const events = [
  { id: 'event-1', title: 'First event', markets: [] },
  { id: 'event-2', title: 'Second event', markets: [] },
];
const ndjson = Buffer.from(`${events.map((event) => JSON.stringify(event)).join('\n')}\n`);
const originalFetch = globalThis.fetch;
const apiClient = PolymarketApiClient.getInstance();

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

function splitBodyAfterFirstByte(value) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(value.subarray(0, 1));
      controller.enqueue(value.subarray(1));
      controller.close();
    },
  });
}

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
  console.log('R2 event snapshot magic-byte smoke test passed');
} finally {
  globalThis.fetch = originalFetch;
}
