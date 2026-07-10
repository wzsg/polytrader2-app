import { onScopeDispose, ref } from 'vue';
import type { SportsCategoryConfig } from '@polytrader/shared';

function useSportsCategory() {
  const config = ref<SportsCategoryConfig | null>(null);
  const loading = ref(false);
  const error = ref('');

  const unsubscribeCategoryConfigChanged = window.api.onCategoryConfigChanged((event) => {
    if (!event.scopes.includes('sports')) return;
    void loadCategory({ force: true });
  });

  onScopeDispose(() => {
    unsubscribeCategoryConfigChanged();
  });

  async function loadCategory(
    options: { force?: boolean } = {},
  ): Promise<SportsCategoryConfig | null> {
    if (config.value && !options.force) return config.value;

    loading.value = true;
    error.value = '';
    try {
      config.value = await window.api.fetchSportsCategory();
      return config.value;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      return null;
    } finally {
      loading.value = false;
    }
  }

  return {
    config,
    loading,
    error,
    loadCategory,
  };
}

export { useSportsCategory };
