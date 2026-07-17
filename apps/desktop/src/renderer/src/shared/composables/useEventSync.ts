import { computed, ref } from 'vue';
import { translateUiKey } from '../i18n';

export function useEventSync(onComplete?: () => void | Promise<void>) {
  const reportedEventSyncState = ref('idle');
  const eventSyncStopping = ref(false);
  const eventSyncState = computed(() =>
    eventSyncStopping.value ? 'stopping' : reportedEventSyncState.value,
  );
  const eventSyncStatus = ref('');

  function setupEventSync(): void {
    window.api.onEventSyncStatus((status) => {
      reportedEventSyncState.value = status.state;

      if (status.state === 'syncing') {
        eventSyncStatus.value = translateUiKey('eventSync.syncing', {
          page: status.page,
          completedEvents: status.completedEvents,
          totalEvents: status.totalEvents,
          progressPercent: status.progressPercent,
        });
      } else if (status.state === 'finalizing') {
        eventSyncStatus.value = translateUiKey('eventSync.finalizing', {
          progressPercent: status.progressPercent,
        });
      } else if (status.state === 'done') {
        eventSyncStatus.value = translateUiKey('eventSync.done', {
          totalEvents: status.totalEvents,
        });
        void onComplete?.();
      } else if (status.state === 'aborted') {
        eventSyncStatus.value = translateUiKey('eventSync.aborted', {
          completedEvents: status.completedEvents,
        });
        void onComplete?.();
      } else if (status.state === 'error') {
        eventSyncStatus.value = translateUiKey('eventSync.failed', { error: status.error });
      }
    });
  }

  function startEventSync(): void {
    window.api.startEventSync();
  }

  function toggleEventSync(): void {
    if (eventSyncStopping.value) return;
    if (reportedEventSyncState.value === 'syncing') {
      eventSyncStopping.value = true;
      void window.api
        .stopEventSync()
        .catch((error: unknown) => {
          console.warn('Failed to stop event sync', error);
        })
        .finally(() => {
          eventSyncStopping.value = false;
        });
      return;
    }
    if (reportedEventSyncState.value === 'finalizing') return;
    startEventSync();
  }

  return {
    eventSyncState,
    eventSyncStatus,
    setupEventSync,
    toggleEventSync,
  };
}
