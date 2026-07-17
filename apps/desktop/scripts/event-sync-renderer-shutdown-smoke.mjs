import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDir, '..');
const eventSyncListeners = new Set();
const originalWindow = globalThis.window;

function emitEventSyncStatus(status) {
  for (const listener of eventSyncListeners) listener(status);
}

function broadcastEventSyncStatus(gate, status) {
  if (!gate.isEnabled) return;
  emitEventSyncStatus(status);
}

function createWindowApi() {
  return {
    api: {
      onEventSyncStatus(callback) {
        eventSyncListeners.add(callback);
        return () => eventSyncListeners.delete(callback);
      },
      startEventSync() {},
      async stopEventSync() {},
    },
  };
}

async function main() {
  globalThis.window = createWindowApi();
  const vite = await createServer({
    root: desktopRoot,
    appType: 'custom',
    configFile: false,
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true },
  });

  try {
    const { useEventSync } = await vite.ssrLoadModule(
      '/src/renderer/src/shared/composables/useEventSync.ts',
    );
    const { EventSyncStatusBroadcastGate } = await vite.ssrLoadModule(
      '/src/main/services/eventSyncStatusBroadcastGate.ts',
    );
    const broadcastGate = new EventSyncStatusBroadcastGate();
    let completionCount = 0;
    const { eventSyncState, setupEventSync } = useEventSync(() => {
      completionCount += 1;
    });

    const unsubscribe = setupEventSync();
    assert.equal(
      typeof unsubscribe,
      'function',
      'Event sync setup did not provide a renderer subscription cleanup function',
    );

    const doneStatus = {
      state: 'done',
      completedEvents: 1,
      totalEvents: 1,
      progressPercent: 100,
    };
    broadcastEventSyncStatus(broadcastGate, doneStatus);
    assert.equal(completionCount, 1, 'A live renderer did not run the completion callback');
    assert.equal(eventSyncState.value, 'done', 'A live renderer did not receive the sync status');

    broadcastGate.disable();
    assert.equal(
      broadcastGate.isEnabled,
      false,
      'Shutdown did not disable event sync status broadcast',
    );
    broadcastEventSyncStatus(broadcastGate, {
      state: 'aborted',
      completedEvents: 1,
      totalEvents: 1,
      progressPercent: 100,
    });
    assert.equal(
      completionCount,
      1,
      'A shutdown-gated event sync status invoked the renderer completion callback',
    );

    unsubscribe();
    emitEventSyncStatus({
      state: 'aborted',
      completedEvents: 1,
      totalEvents: 1,
      progressPercent: 100,
    });
    assert.equal(
      completionCount,
      1,
      'A disposed renderer ran the completion callback after an aborted sync status',
    );
    assert.equal(
      eventSyncState.value,
      'done',
      'A disposed renderer accepted an event sync status after cleanup',
    );

    console.log('Event sync renderer shutdown smoke test passed');
  } finally {
    await vite.close();
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
}

await main();
