import { computed, ref } from 'vue';
import type { PolymarketWalletSummary } from '@polytrader/shared';
import { translateUiKey } from '../i18n';

export function usePolymarketWalletSelection() {
  const accounts = ref<PolymarketWalletSummary[]>([]);
  const selectedWalletId = ref('');
  const accountsLoading = ref(false);
  const accountsError = ref('');

  const tradableAccounts = computed(() =>
    accounts.value.filter((account) => account.credentialsConfigured),
  );

  const selectedAccount = computed(
    () => tradableAccounts.value.find((account) => account.id === selectedWalletId.value) ?? null,
  );

  function selectDefaultAccount(): void {
    const current = tradableAccounts.value.find((account) => account.id === selectedWalletId.value);
    if (current) return;
    selectedWalletId.value =
      tradableAccounts.value.find((account) => account.isDefault)?.id ??
      tradableAccounts.value[0]?.id ??
      '';
  }

  async function loadAccounts(): Promise<void> {
    accountsLoading.value = true;
    accountsError.value = '';
    try {
      const res = await window.api.listPolymarketWallets();
      if (!res.ok) {
        accounts.value = [];
        selectedWalletId.value = '';
        accountsError.value = res.error || translateUiKey('common.accountLoadFailed');
        return;
      }
      accounts.value = res.data;
      selectDefaultAccount();
    } finally {
      accountsLoading.value = false;
    }
  }

  return {
    accounts,
    tradableAccounts,
    selectedWalletId,
    selectedAccount,
    accountsLoading,
    accountsError,
    loadAccounts,
  };
}
