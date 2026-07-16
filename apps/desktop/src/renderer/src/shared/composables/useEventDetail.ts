import { ref } from 'vue';
import type { ApiEvent } from '@polytrader/shared';
import { normalizeApiEvent } from '@/shared/utils/apiEvent';
import { translateUiKey } from '../i18n';
import { createRequestId } from '../utils/request';

export function useEventDetail() {
  const event = ref<ApiEvent | null>(null);
  const loading = ref(false);
  const error = ref('');
  let activeRequestId = '';

  async function loadEvent(eventId: string, requestId = createRequestId()): Promise<void> {
    activeRequestId = requestId;
    loading.value = true;
    error.value = '';
    event.value = null;
    try {
      const response = await window.api.fetchEvent({ requestId, data: { eventId } });
      if (response.requestId !== activeRequestId) return;
      event.value = normalizeApiEvent(response.data);
    } catch (err) {
      if (requestId !== activeRequestId) return;
      error.value = err instanceof Error ? err.message : translateUiKey('common.loadFailed');
    } finally {
      if (requestId === activeRequestId) loading.value = false;
    }
  }

  function clearEvent(): void {
    activeRequestId = createRequestId();
    event.value = null;
    error.value = '';
    loading.value = false;
  }

  return {
    event,
    loading,
    error,
    loadEvent,
    clearEvent,
  };
}
