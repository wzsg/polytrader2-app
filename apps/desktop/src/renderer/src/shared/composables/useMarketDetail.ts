import { ref, watch, type Ref } from 'vue';
import type { MarketDetailData } from '@polytrader/shared';
import { translateUiKey } from '../i18n';

export function useMarketDetail(marketId: Ref<string | null>) {
  const data = ref<MarketDetailData | null>(null);
  const loading = ref(false);
  const error = ref('');
  let requestSeq = 0;

  async function refresh(options: { silent?: boolean } = {}): Promise<void> {
    if (!marketId.value) return;

    const silent = options.silent === true;
    const seq = ++requestSeq;
    const targetMarketId = marketId.value;
    if (!silent) {
      loading.value = true;
      error.value = '';
      data.value = null;
    }

    try {
      const res = await window.api.fetchMarketDetail(targetMarketId);
      if (seq !== requestSeq) return;

      if (!res.ok) {
        if (!silent || !data.value) error.value = res.error || translateUiKey('common.loadFailed');
        return;
      }
      if (String(res.data?.market?.id) !== String(targetMarketId)) return;
      data.value = res.data;
      error.value = '';
    } catch (err) {
      if (seq !== requestSeq) return;
      if (!silent || !data.value) error.value = err instanceof Error ? err.message : String(err);
    } finally {
      if (seq === requestSeq && !silent) {
        loading.value = false;
      }
    }
  }

  watch(
    marketId,
    () => {
      void refresh();
    },
    { immediate: true },
  );

  return {
    data,
    loading,
    error,
    refresh,
  };
}
