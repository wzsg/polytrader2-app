import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FileCacheStore, MemoryCacheStore } from '@polytrader/cache-store';

const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'polytrader2-cache-store-smoke-'));

try {
  const fileCacheStore = new FileCacheStore();
  await fileCacheStore.initialize(userDataPath);
  await fileCacheStore.setValue('persisted', { value: 1 }, null);
  assert.deepEqual(await fileCacheStore.getValue('persisted'), { value: 1 });

  const memoryCacheStore = new MemoryCacheStore({ maxEntries: 2 });
  let loaderCalls = 0;
  const loader = async () => {
    loaderCalls += 1;
    return { value: loaderCalls };
  };
  const [first, second] = await Promise.all([
    memoryCacheStore.getOrSetValue('shared', 60_000, loader),
    memoryCacheStore.getOrSetValue('shared', 60_000, loader),
  ]);
  assert.deepEqual(first, { value: 1 });
  assert.deepEqual(second, { value: 1 });
  assert.equal(loaderCalls, 1);

  await memoryCacheStore.setValue('oldest', 1, null);
  await memoryCacheStore.setValue('newest', 2, null);
  assert.equal(await memoryCacheStore.getValue('shared'), null);
  assert.equal(await memoryCacheStore.getValue('oldest'), 1);
  assert.equal(await memoryCacheStore.getValue('newest'), 2);

  await memoryCacheStore.setValue('expired', true, 1);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(await memoryCacheStore.getValue('expired'), null);

  console.log('Cache store smoke passed');
} finally {
  await fs.rm(userDataPath, { recursive: true, force: true });
}
