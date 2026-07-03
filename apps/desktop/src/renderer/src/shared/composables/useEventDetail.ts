import { ref } from 'vue';
import type { ApiEvent } from '@polytrader/shared';
import { normalizeApiEvent } from '@/shared/utils/apiEvent';
import { translateUiKey } from '../i18n';

export function useEventDetail() {
  const event = ref<ApiEvent | null>(null);
  const loading = ref(false);
  const error = ref('');

  async function loadEvent(eventId: string): Promise<void> {
    loading.value = true;
    error.value = '';
    event.value = null;
    try {
      const data = await window.api.fetchEvent(eventId);
      event.value = normalizeApiEvent(data);
    } catch (err) {
      error.value = err instanceof Error ? err.message : translateUiKey('common.loadFailed');
    } finally {
      loading.value = false;
    }
  }

  function clearEvent(): void {
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
