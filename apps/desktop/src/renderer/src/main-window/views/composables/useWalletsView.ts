import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  POLYMARKET_CLOB_BASE_URL,
  POLYMARKET_REFERRAL_URL,
  POLYMARKET_WALLET_LIMIT,
  type BalanceAllowance,
  type PolymarketWalletImportInput,
  type PolymarketWalletSummary,
  type PolymarketWalletUpdateInput,
} from '@polytrader/shared';
import { formatPercent, formatPnl, formatUsd } from '@/shared/utils/format';

type AccountDialogMode =
  'create' | 'createHd' | 'derive' | 'importPrivateKey' | 'importMnemonic' | 'edit';
const POLYMARKET_URL = POLYMARKET_REFERRAL_URL;

export function useWalletsView() {
  const { t } = useI18n();
  const accounts = ref<PolymarketWalletSummary[]>([]);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref('');
  const dialogError = ref('');
  const showCreateDialog = ref(false);
  const dialogMode = ref<AccountDialogMode>('create');
  const editingWalletId = ref<string | null>(null);
  const derivingParentWalletId = ref<string | null>(null);
  const nameAutoFilled = ref(false);
  const deleteConfirmOpen = ref(false);
  const deleteConfirmError = ref('');
  const deleteConfirmationName = ref('');
  const deleting = ref(false);
  const deletingWallet = ref<PolymarketWalletSummary | null>(null);
  let unsubscribeWalletEvent: (() => void) | null = null;
  const isFirstAccountDefaultLocked = computed(
    () => accounts.value.length === 0 && dialogMode.value !== 'edit',
  );
  const walletLimitReached = computed(() => accounts.value.length >= POLYMARKET_WALLET_LIMIT);
  const walletLimitMessage = computed(() =>
    t('account.limitReached', { count: POLYMARKET_WALLET_LIMIT }),
  );
  const isDeleteConfirmationValid = computed(
    () =>
      deletingWallet.value !== null && deleteConfirmationName.value === deletingWallet.value.name,
  );

  const form = reactive<PolymarketWalletImportInput>({
    name: '',
    privateKey: '',
    mnemonic: '',
    apiKey: '',
    secret: '',
    passphrase: '',
    depositWalletAddress: '',
    relayerApiKey: '',
    signatureType: 3,
    chainId: 137,
    clobHost: POLYMARKET_CLOB_BASE_URL,
    isDefault: false,
  });

  function resetForm(): void {
    editingWalletId.value = null;
    derivingParentWalletId.value = null;
    nameAutoFilled.value = false;
    form.name = '';
    form.privateKey = '';
    form.mnemonic = '';
    form.apiKey = '';
    form.secret = '';
    form.passphrase = '';
    form.depositWalletAddress = '';
    form.relayerApiKey = '';
    form.signatureType = 3;
    form.chainId = 137;
    form.clobHost = POLYMARKET_CLOB_BASE_URL;
    form.isDefault = accounts.value.length === 0;
  }

  function nextDefaultAccountName(): string {
    const names = new Set(accounts.value.map((account) => account.name.trim()));
    let index = 1;
    let name = `Wallet ${index}`;
    while (names.has(name)) {
      index += 1;
      name = `Wallet ${index}`;
    }
    return name;
  }

  function nextDerivedAccountName(parentName: string): string {
    const names = new Set(accounts.value.map((account) => account.name.trim()));
    let index = 1;
    let name = `${parentName} Derived ${index}`;
    while (names.has(name)) {
      index += 1;
      name = `${parentName} Derived ${index}`;
    }
    return name;
  }

  function isAccountCreateDialogMode(mode: AccountDialogMode): boolean {
    return mode !== 'edit';
  }

  function setAccountLimitError(): void {
    dialogError.value = walletLimitMessage.value;
    error.value = walletLimitMessage.value;
  }

  function openCreateDialog(mode: AccountDialogMode = 'create'): void {
    if (isAccountCreateDialogMode(mode) && walletLimitReached.value) {
      setAccountLimitError();
      return;
    }
    resetForm();
    form.name = nextDefaultAccountName();
    nameAutoFilled.value = true;
    dialogError.value = '';
    dialogMode.value = mode;
    showCreateDialog.value = true;
  }

  function openImportPrivateKeyDialog(): void {
    openCreateDialog('importPrivateKey');
  }

  function openCreateHdDialog(): void {
    openCreateDialog('createHd');
  }

  function openImportMnemonicDialog(): void {
    openCreateDialog('importMnemonic');
  }

  function openDeriveDialog(parentAccount: PolymarketWalletSummary): void {
    if (walletLimitReached.value) {
      setAccountLimitError();
      return;
    }
    resetForm();
    derivingParentWalletId.value = parentAccount.id;
    form.name = nextDerivedAccountName(parentAccount.name);
    nameAutoFilled.value = true;
    dialogError.value = '';
    dialogMode.value = 'derive';
    showCreateDialog.value = true;
  }

  function openEditDialog(account: PolymarketWalletSummary): void {
    resetForm();
    dialogError.value = '';
    editingWalletId.value = account.id;
    dialogMode.value = 'edit';
    form.name = account.name;
    form.relayerApiKey = '';
    form.isDefault = account.isDefault;
    showCreateDialog.value = true;
  }

  function handleNameFocus(): void {
    if (dialogMode.value === 'edit' || !nameAutoFilled.value) return;
    form.name = '';
    nameAutoFilled.value = false;
  }

  function closeCreateDialog(): void {
    if (saving.value) return;
    showCreateDialog.value = false;
  }

  async function loadAccounts(): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
      const res = await window.api.wallet.list();
      if (!res.ok) throw new Error(res.error);
      accounts.value = res.data;
      if (!form.name) form.isDefault = res.data.length === 0;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }

  function renderBalance(account: PolymarketWalletSummary): string {
    if (!account.credentialsConfigured) return '—';
    if (!account.balance) return '';
    return account.balance.balanceUsd
      ? formatUsd(account.balance.balanceUsd)
      : account.balance.balance;
  }

  function isBalanceLoading(account: PolymarketWalletSummary): boolean {
    if (!account.credentialsConfigured) return false;
    return !account.balance;
  }

  function balanceTitle(account: PolymarketWalletSummary): string {
    if (account.balance) return `Raw: ${account.balance.balance}`;
    return '';
  }

  function updateAccountBalance(walletId: string, balance: BalanceAllowance): void {
    accounts.value = accounts.value.map((account) =>
      account.id === walletId ? { ...account, balance } : account,
    );
  }

  function renderPositionsTotalValue(account: PolymarketWalletSummary): string {
    if (!hasPositionSync(account)) return '—';
    if (account.positionsTotalValue == null) return '';
    return formatUsd(account.positionsTotalValue);
  }

  function renderPositionsPnl(account: PolymarketWalletSummary): string {
    const pnl = positionPnl(account);
    if (pnl == null) return hasPositionSync(account) ? '' : '—';
    const percent = positionPnlPercent(account);
    return percent == null ? formatPnl(pnl) : `${formatPnl(pnl)} (${formatPercent(percent)})`;
  }

  function isPositionSummaryLoading(account: PolymarketWalletSummary): boolean {
    return hasPositionSync(account) && account.positionsTotalValue == null;
  }

  function positionPnl(account: PolymarketWalletSummary): number | null {
    if (account.positionsTotalValue == null || account.positionsInitialValue == null) return null;
    return account.positionsTotalValue - account.positionsInitialValue;
  }

  function positionPnlPercent(account: PolymarketWalletSummary): number | null {
    const pnl = positionPnl(account);
    if (
      pnl == null ||
      account.positionsInitialValue == null ||
      account.positionsInitialValue <= 0
    ) {
      return null;
    }
    return (pnl / account.positionsInitialValue) * 100;
  }

  function positionPnlClass(account: PolymarketWalletSummary): string {
    const pnl = positionPnl(account);
    if (pnl == null) return hasPositionSync(account) ? 'text-text' : 'text-muted';
    if (pnl > 0) return 'text-green-400';
    if (pnl < 0) return 'text-red-400';
    return 'text-text';
  }

  function updateAccountPositionSummary(
    walletId: string,
    summary: {
      positionsTotalValue: number | null;
      positionsInitialValue: number | null;
    },
  ): void {
    accounts.value = accounts.value.map((account) =>
      account.id === walletId ? { ...account, ...summary } : account,
    );
  }

  function hasPositionSync(account: PolymarketWalletSummary): boolean {
    return Boolean(account.depositWalletAddress.trim());
  }

  async function saveAccount(): Promise<void> {
    saving.value = true;
    dialogError.value = '';
    try {
      if (isAccountCreateDialogMode(dialogMode.value) && walletLimitReached.value) {
        throw new Error(walletLimitMessage.value);
      }
      const res = await saveDialogAccount();
      if (!res.ok) throw new Error(res.error);
      await loadAccounts();
      resetForm();
      showCreateDialog.value = false;
    } catch (err) {
      dialogError.value = err instanceof Error ? err.message : String(err);
    } finally {
      saving.value = false;
    }
  }

  async function saveDialogAccount() {
    if (dialogMode.value === 'create') {
      return window.api.wallet.create({
        name: form.name,
        isDefault: isFirstAccountDefaultLocked.value ? true : form.isDefault,
      });
    }

    if (dialogMode.value === 'createHd') {
      return window.api.wallet.create({
        name: form.name,
        walletKeyMaterialType: 'mnemonic_seed',
        isDefault: isFirstAccountDefaultLocked.value ? true : form.isDefault,
      });
    }

    if (dialogMode.value === 'importPrivateKey') {
      return window.api.wallet.import({
        name: form.name,
        walletKeyMaterialType: 'private_key',
        privateKey: form.privateKey,
        chainId: form.chainId,
        clobHost: form.clobHost,
        isDefault: isFirstAccountDefaultLocked.value ? true : form.isDefault,
      });
    }

    if (dialogMode.value === 'importMnemonic') {
      return window.api.wallet.import({
        name: form.name,
        walletKeyMaterialType: 'mnemonic_seed',
        mnemonic: form.mnemonic,
        chainId: form.chainId,
        clobHost: form.clobHost,
        isDefault: isFirstAccountDefaultLocked.value ? true : form.isDefault,
      });
    }

    if (dialogMode.value === 'derive') {
      if (!derivingParentWalletId.value) throw new Error('Select an HD wallet to derive from');
      return window.api.wallet.createDerived({
        parentWalletId: derivingParentWalletId.value,
        name: form.name,
        isDefault: isFirstAccountDefaultLocked.value ? true : form.isDefault,
      });
    }

    if (dialogMode.value === 'edit') {
      if (!editingWalletId.value) throw new Error('Select an account to edit');
      const input: PolymarketWalletUpdateInput = {
        id: editingWalletId.value,
        name: form.name,
        relayerApiKey: form.relayerApiKey,
        isDefault: form.isDefault,
      };
      return window.api.wallet.update(input);
    }

    return window.api.wallet.import({ ...form });
  }

  async function setDefault(id: string): Promise<void> {
    const res = await window.api.wallet.setDefault(id);
    if (!res.ok) {
      error.value = res.error;
      return;
    }
    await loadAccounts();
  }

  async function retryInitialization(id: string): Promise<void> {
    error.value = '';
    const res = await window.api.wallet.retryInitialization(id);
    if (!res.ok) {
      error.value = res.error;
      return;
    }
    await loadAccounts();
  }

  function requestDeleteAccount(account: PolymarketWalletSummary): void {
    deletingWallet.value = account;
    deleteConfirmationName.value = '';
    deleteConfirmError.value = '';
    deleteConfirmOpen.value = true;
  }

  function cancelDeleteAccount(): void {
    if (deleting.value) return;
    deleteConfirmOpen.value = false;
    deletingWallet.value = null;
    deleteConfirmationName.value = '';
    deleteConfirmError.value = '';
  }

  async function confirmDeleteAccount(): Promise<void> {
    if (!deletingWallet.value || !isDeleteConfirmationValid.value) return;
    deleting.value = true;
    deleteConfirmError.value = '';
    const res = await window.api.wallet.delete(deletingWallet.value.id);
    if (!res.ok) {
      deleteConfirmError.value = res.error;
      deleting.value = false;
      return;
    }
    await loadAccounts();
    deleting.value = false;
    deleteConfirmOpen.value = false;
    deletingWallet.value = null;
    deleteConfirmationName.value = '';
  }

  async function openPolymarketBrowser(walletId?: string): Promise<void> {
    error.value = '';
    try {
      const res = walletId
        ? await window.api.browserNavigate(POLYMARKET_URL, { preferredAccountId: walletId })
        : await window.api.browserNavigate(POLYMARKET_URL);
      if (!res.ok) throw new Error(res.error);
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    }
  }

  async function writeClipboardText(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();

    try {
      if (!document.execCommand('copy')) {
        throw new Error('Failed to write to clipboard');
      }
    } finally {
      document.body.removeChild(textarea);
    }
  }

  async function copyText(text: string, label: string): Promise<void> {
    const value = text.trim();
    if (!value) {
      error.value = `${label} is empty`;
      return;
    }

    error.value = '';
    try {
      await writeClipboardText(value);
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    }
  }

  function copyWalletAddress(account: PolymarketWalletSummary): Promise<void> {
    return copyText(account.walletAddress, 'EOA wallet address');
  }

  function copyDepositWalletAddress(account: PolymarketWalletSummary): Promise<void> {
    return copyText(account.depositWalletAddress, 'deposit wallet address');
  }

  onMounted(() => {
    void loadAccounts();
    unsubscribeWalletEvent = window.api.wallet.onEvent(() => {
      void loadAccounts();
    });
  });

  onBeforeUnmount(() => {
    unsubscribeWalletEvent?.();
    unsubscribeWalletEvent = null;
  });

  return {
    accounts,
    loading,
    saving,
    error,
    dialogError,
    showCreateDialog,
    dialogMode,
    deleteConfirmOpen,
    deleteConfirmError,
    deleteConfirmationName,
    deleting,
    deletingWallet,
    isDeleteConfirmationValid,
    isFirstAccountDefaultLocked,
    walletLimitReached,
    walletLimitMessage,
    form,
    openCreateDialog,
    openCreateHdDialog,
    openDeriveDialog,
    openImportPrivateKeyDialog,
    openImportMnemonicDialog,
    openEditDialog,
    handleNameFocus,
    closeCreateDialog,
    loadAccounts,
    updateAccountBalance,
    updateAccountPositionSummary,
    renderBalance,
    renderPositionsTotalValue,
    renderPositionsPnl,
    isBalanceLoading,
    isPositionSummaryLoading,
    balanceTitle,
    positionPnlClass,
    saveAccount,
    setDefault,
    retryInitialization,
    requestDeleteAccount,
    cancelDeleteAccount,
    confirmDeleteAccount,
    openPolymarketBrowser,
    copyWalletAddress,
    copyDepositWalletAddress,
  };
}
