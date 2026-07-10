import { ref } from 'vue';
import { translateUiKey } from '../i18n';

export function useSync(onComplete?: () => void | Promise<void>) {
  const syncState = ref('idle');
  const syncStatus = ref('');

  function setupSync(): void {
    window.api.onSyncStatus((status) => {
      syncState.value = status.state;

      if (status.state === 'syncing') {
        syncStatus.value = translateUiKey('sync.syncing', {
          page: status.page,
          completedEvents: status.completedEvents,
          totalEvents: status.totalEvents,
          progressPercent: status.progressPercent,
        });
      } else if (status.state === 'finalizing') {
        syncStatus.value = translateUiKey('sync.finalizing', {
          progressPercent: status.progressPercent,
        });
      } else if (status.state === 'done') {
        syncStatus.value = translateUiKey('sync.done', { totalEvents: status.totalEvents });
        void onComplete?.();
      } else if (status.state === 'aborted') {
        syncStatus.value = translateUiKey('sync.aborted', {
          completedEvents: status.completedEvents,
        });
        void onComplete?.();
      } else if (status.state === 'error') {
        syncStatus.value = translateUiKey('sync.failed', { error: status.error });
      }
    });
  }

  function startSync(): void {
    window.api.startSync();
  }

  function toggleSync(): void {
    if (syncState.value === 'syncing' || syncState.value === 'finalizing') return;
    startSync();
  }

  return {
    syncState,
    syncStatus,
    setupSync,
    toggleSync,
  };
}
