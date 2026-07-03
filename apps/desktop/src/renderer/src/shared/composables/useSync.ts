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
          total: status.total,
        });
      } else if (status.state === 'done') {
        syncStatus.value = translateUiKey('sync.done', { total: status.total });
        void onComplete?.();
      } else if (status.state === 'aborted') {
        syncStatus.value = translateUiKey('sync.aborted', { total: status.total });
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
    if (syncState.value === 'syncing') return;
    startSync();
  }

  return {
    syncState,
    syncStatus,
    setupSync,
    toggleSync,
  };
}
