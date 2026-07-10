import { ref, unref, type Ref } from 'vue';
import type { ApiResult, TradingAccountDataQuery } from '@polytrader/shared';
import { translateUiKey } from '../i18n';

type TradingAccountDataRefreshOptions = {
  silent?: boolean;
};

function useTradingAccountData<T>(
  fetchFn: (query: TradingAccountDataQuery) => Promise<ApiResult<T[]>>,
  options: {
    statusKey?: 'credentialsConfigured' | 'positionsConfigured';
    walletId?: Ref<string>;
  } = {},
) {
  const statusKey = options.statusKey || 'credentialsConfigured';
  const items = ref<T[]>([]);
  const loading = ref(false);
  const error = ref('');
  const configured = ref(true);

  function getAccountId(): string | undefined {
    return options.walletId ? unref(options.walletId) || undefined : undefined;
  }

  function getQuery(): TradingAccountDataQuery {
    return {
      walletId: getAccountId(),
    };
  }

  async function checkStatus(): Promise<boolean> {
    const walletId = getAccountId();
    if (!walletId) {
      configured.value = false;
      return false;
    }

    const res = await window.api.tradingAccount.getStatus(walletId);
    if (res.ok) {
      configured.value = Boolean(res.data[statusKey]);
    }
    return configured.value;
  }

  async function refresh(refreshOptions: TradingAccountDataRefreshOptions = {}): Promise<void> {
    if (!refreshOptions.silent) loading.value = true;
    error.value = '';
    try {
      if (!(await checkStatus())) {
        items.value = [];
        return;
      }
      const res = await fetchFn(getQuery());
      if (!res.ok) {
        error.value = res.error || translateUiKey('common.requestFailed');
        items.value = [];
        return;
      }
      items.value = Array.isArray(res.data) ? res.data : [];
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      items.value = [];
    } finally {
      if (!refreshOptions.silent) loading.value = false;
    }
  }

  function clear(): void {
    items.value = [];
    error.value = '';
    configured.value = true;
  }

  return {
    items,
    loading,
    error,
    configured,
    refresh,
    checkStatus,
    clear,
  };
}

export { useTradingAccountData };
