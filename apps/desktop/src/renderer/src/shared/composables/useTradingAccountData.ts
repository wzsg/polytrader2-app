import { ref, unref, type Ref } from 'vue';
import type {
  ApiResult,
  TradingAccountDataQuery,
  TradingAccountScopedData,
} from '@polytrader/shared';
import { translateUiKey } from '../i18n';
import { createRequestId } from '../utils/request';

type TradingAccountDataRefreshOptions = {
  silent?: boolean;
};

function useTradingAccountData<T>(
  fetchFn: (query: TradingAccountDataQuery) => Promise<ApiResult<TradingAccountScopedData<T>>>,
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
  let refreshVersion = 0;

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
    const version = ++refreshVersion;
    const query = { ...getQuery(), requestId: createRequestId() };
    if (!refreshOptions.silent) loading.value = true;
    error.value = '';
    try {
      const isConfigured = await checkStatus();
      if (version !== refreshVersion || query.walletId !== getAccountId()) return;
      if (!isConfigured) {
        items.value = [];
        return;
      }
      const res = await fetchFn(query);
      if (version !== refreshVersion || query.walletId !== getAccountId()) return;
      if (!res.ok) {
        error.value = res.error || translateUiKey('common.requestFailed');
        items.value = [];
        return;
      }
      if (
        res.data.requestId !== query.requestId ||
        res.data.walletId !== (query.walletId ?? null) ||
        res.data.conditionId !== null
      ) {
        return;
      }
      items.value = Array.isArray(res.data.items) ? res.data.items : [];
    } catch (err) {
      if (version !== refreshVersion) return;
      error.value = err instanceof Error ? err.message : String(err);
      items.value = [];
    } finally {
      if (version === refreshVersion && !refreshOptions.silent) loading.value = false;
    }
  }

  function clear(): void {
    refreshVersion += 1;
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
