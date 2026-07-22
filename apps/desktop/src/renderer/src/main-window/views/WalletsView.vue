<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import QRCode from 'qrcode';
import {
  AlertTriangle,
  ArrowLeftRight,
  Briefcase,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Copy,
  Download,
  GitBranch,
  Globe2,
  KeyRound,
  LoaderCircle,
  PanelBottomClose,
  PanelBottomOpen,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Star,
  Trash2,
  Upload,
  Wallet,
  X,
} from '@lucide/vue';
import type {
  ClobOrder,
  ClobTrade,
  DataPosition,
  PolymarketWalletKeyMaterialReveal,
  PolymarketWalletSummary,
  TradingAccountDataEvent,
} from '@polytrader/shared';
import ContextMenu, { type ContextMenuItem } from '@/shared/components/ContextMenu.vue';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';
import { formatAddress } from '@/shared/utils/format';
import { useTradingAccountData } from '../../shared/composables/useTradingAccountData';
import WalletDepositDialog from './wallet-panels/WalletDepositDialog.vue';
import WalletOrdersPanel from './wallet-panels/WalletOrdersPanel.vue';
import WalletPositionsPanel from './wallet-panels/WalletPositionsPanel.vue';
import WalletTradesPanel from './wallet-panels/WalletTradesPanel.vue';
import WalletWithdrawDialog from './wallet-panels/WalletWithdrawDialog.vue';
import { useWalletsView } from './composables/useWalletsView';

type AccountAssetTab = 'orders' | 'trades' | 'positions';
type KeyMaterialDisplayMode = 'text' | 'qr';
type AccountTableRow = {
  account: PolymarketWalletSummary;
  depth: number;
  hasChildren: boolean;
};

const DETAIL_PANEL_MIN_HEIGHT = 220;
const DETAIL_PANEL_MAX_HEIGHT = 620;
const DETAIL_PANEL_DEFAULT_HEIGHT = 360;

const { t } = useI18n();

const {
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
  renderBalance,
  renderPositionsTotalValue,
  renderPositionsPnl,
  isBalanceLoading,
  isPositionSummaryLoading,
  balanceTitle,
  positionPnlClass,
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
  saveAccount,
  setDefault,
  retryInitialization,
  requestDeleteAccount,
  cancelDeleteAccount,
  confirmDeleteAccount,
  openPolymarketBrowser,
  copyWalletAddress,
  copyDepositWalletAddress,
} = useWalletsView();

const accountActionMenuRef = ref<HTMLElement | null>(null);
const accountActionMenuOpen = ref(false);
const accountContextMenuOpen = ref(false);
const accountContextMenuX = ref(0);
const accountContextMenuY = ref(0);
const contextWallet = ref<PolymarketWalletSummary | null>(null);
const keyMaterialConfirmOpen = ref(false);
const keyMaterialDialogOpen = ref(false);
const keyMaterialLoading = ref(false);
const keyMaterialBackupSaving = ref(false);
const keyMaterialError = ref('');
const keyMaterialWallet = ref<PolymarketWalletSummary | null>(null);
const keyMaterialReveal = ref<PolymarketWalletKeyMaterialReveal | null>(null);
const keyMaterialDisplayMode = ref<KeyMaterialDisplayMode>('text');
const keyMaterialQrCodeUrl = ref('');
const keyMaterialQrCodeLoading = ref(false);
const bridgeDepositDialogOpen = ref(false);
const bridgeWithdrawDialogOpen = ref(false);
const bridgeWallet = ref<PolymarketWalletSummary | null>(null);
const selectedWalletId = ref('');
const expandedWalletIds = ref<Set<string>>(new Set());
const activeAssetTab = ref<AccountAssetTab>('positions');
const detailPanelCollapsed = ref(readDetailPanelCollapsed());
const detailPanelHeight = ref(readDetailPanelHeight());
let dragStartY = 0;
let dragStartHeight = DETAIL_PANEL_DEFAULT_HEIGHT;
let unsubscribeTradingAccountEvent: (() => void) | null = null;
let ordersRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let tradesRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let positionsRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let accountAssetsLoadId = 0;

const {
  items: orders,
  loading: ordersLoading,
  error: ordersError,
  configured: ordersConfigured,
  refresh: refreshOrders,
  clear: clearOrders,
} = useTradingAccountData<ClobOrder>((query) => window.api.tradingAccount.getOrders(query), {
  walletId: selectedWalletId,
});
const {
  items: trades,
  loading: tradesLoading,
  error: tradesError,
  configured: tradesConfigured,
  refresh: refreshTrades,
  clear: clearTrades,
} = useTradingAccountData<ClobTrade>((query) => window.api.tradingAccount.getTrades(query), {
  walletId: selectedWalletId,
});
const {
  items: positions,
  loading: positionsLoading,
  error: positionsError,
  configured: positionsConfigured,
  refresh: refreshPositions,
  clear: clearPositions,
} = useTradingAccountData<DataPosition>((query) => window.api.tradingAccount.getPositions(query), {
  statusKey: 'positionsConfigured',
  walletId: selectedWalletId,
});

const assetTabs: Array<{ id: AccountAssetTab; label: string; icon: typeof ClipboardList }> = [
  { id: 'positions', label: 'account.positions', icon: Briefcase },
  { id: 'orders', label: 'account.orders', icon: ClipboardList },
  { id: 'trades', label: 'account.trades', icon: ArrowLeftRight },
];

const dialogTitle = computed(() => {
  if (dialogMode.value === 'create') return t('account.create');
  if (dialogMode.value === 'createHd') return t('account.createHd');
  if (dialogMode.value === 'derive') return t('account.derive');
  if (dialogMode.value === 'edit') return t('account.edit');
  if (dialogMode.value === 'importMnemonic') return t('account.importMnemonic');
  return t('account.importPrivateKey');
});

const dialogDescription = computed(() => {
  if (dialogMode.value === 'create') return t('account.createDescription');
  if (dialogMode.value === 'createHd') return t('account.createHdDescription');
  if (dialogMode.value === 'derive') return t('account.deriveDescription');
  if (dialogMode.value === 'edit') return t('account.editDescription');
  if (dialogMode.value === 'importMnemonic') return t('account.importMnemonicDescription');
  return t('account.importPrivateKeyDescription');
});

const dialogSubmitLabel = computed(() => {
  if (dialogMode.value === 'create') return t('account.create');
  if (dialogMode.value === 'createHd') return t('account.createHd');
  if (dialogMode.value === 'derive') return t('account.derive');
  if (dialogMode.value === 'edit') return t('account.saveChanges');
  if (dialogMode.value === 'importMnemonic') return t('account.importMnemonic');
  return t('account.importPrivateKey');
});

const selectedAccount = computed(
  () => accounts.value.find((account) => account.id === selectedWalletId.value) || null,
);

const accountRows = computed<AccountTableRow[]>(() => {
  const walletIds = new Set(accounts.value.map((account) => account.id));
  const childrenByParentId = new Map<string, PolymarketWalletSummary[]>();
  const topLevelAccounts: PolymarketWalletSummary[] = [];

  for (const account of accounts.value) {
    if (account.parentWalletId && walletIds.has(account.parentWalletId)) {
      const children = childrenByParentId.get(account.parentWalletId) || [];
      children.push(account);
      childrenByParentId.set(account.parentWalletId, children);
      continue;
    }

    topLevelAccounts.push(account);
  }

  return topLevelAccounts.flatMap((account) => {
    const children = childrenByParentId.get(account.id) || [];
    const rows: AccountTableRow[] = [{ account, depth: 0, hasChildren: children.length > 0 }];
    if (children.length > 0 && expandedWalletIds.value.has(account.id)) {
      rows.push(
        ...children.map((child) => ({
          account: child,
          depth: 1,
          hasChildren: false,
        })),
      );
    }
    return rows;
  });
});

const accountContextMenuItems = computed<ContextMenuItem[]>(() => {
  const account = contextWallet.value;
  if (!account) return [];

  const items: ContextMenuItem[] = [
    {
      label: t('account.openPolymarket'),
      icon: Globe2,
      onSelect: () => openPolymarketBrowser(account.id),
    },
    {
      label: t('bridge.deposit'),
      icon: Download,
      disabled: !account.depositWalletAddress,
      title: account.depositWalletAddress
        ? t('bridge.deposit')
        : t('account.noDepositWalletAddress'),
      onSelect: () => openBridgeDepositDialog(account),
    },
    {
      label: t('bridge.withdraw'),
      icon: Upload,
      disabled: !account.credentialsConfigured,
      title: account.credentialsConfigured
        ? t('bridge.withdraw')
        : t('tradingWindow.credentialsRequired'),
      onSelect: () => openBridgeWithdrawDialog(account),
    },
    {
      label: t('common.copy'),
      icon: Copy,
      children: [
        {
          label: t('account.eoaWalletAddress'),
          icon: Wallet,
          title: account.walletAddress,
          onSelect: () => copyWalletAddress(account),
        },
        {
          label: t('account.depositWalletAddress'),
          icon: Wallet,
          disabled: !account.depositWalletAddress,
          title: account.depositWalletAddress || t('account.noDepositWalletAddress'),
          onSelect: () => copyDepositWalletAddress(account),
        },
      ],
    },
    {
      label:
        account.walletKeyMaterialType === 'mnemonic_seed'
          ? t('account.backupMnemonic')
          : t('account.backupPrivateKey'),
      icon: KeyRound,
      onSelect: () => requestKeyMaterialReveal(account),
    },
    {
      label: t('account.setDefaultWallet'),
      icon: Star,
      disabled: account.isDefault,
      title: account.isDefault ? t('account.defaultWalletCurrent') : t('account.setDefaultWallet'),
      onSelect: () => setDefault(account.id),
    },
  ];

  if (account.walletKeyMaterialType === 'mnemonic_seed') {
    items.push({
      label: t('account.derive'),
      icon: GitBranch,
      disabled: walletLimitReached.value,
      title: walletLimitReached.value ? walletLimitMessage.value : t('account.derive'),
      ariaLabel: walletLimitReached.value ? walletLimitMessage.value : t('account.derive'),
      onSelect: () => openDeriveDialog(account),
    });
  }

  if (account.initializationStatus === 'failed') {
    items.push({
      label: t('common.retry'),
      icon: RotateCcw,
      title: t('account.retryInitialization'),
      onSelect: () => retryInitialization(account.id),
    });
  }

  items.push(
    { separator: true },
    {
      label: t('common.edit'),
      icon: Pencil,
      onSelect: () => openEditDialog(account),
    },
    {
      label: t('common.delete'),
      icon: Trash2,
      danger: true,
      onSelect: () => requestDeleteAccount(account),
    },
  );

  return items;
});

const keyMaterialDialogTitle = computed(() => {
  if (keyMaterialReveal.value?.type === 'mnemonic') return t('account.backupMnemonic');
  return t('account.backupPrivateKey');
});

function detailPanelStorageKey(): string {
  return 'main-window:wallets:detail-panel-height';
}

function detailPanelCollapsedStorageKey(): string {
  return 'main-window:wallets:detail-panel-collapsed';
}

function readDetailPanelCollapsed(): boolean {
  return window.localStorage.getItem(detailPanelCollapsedStorageKey()) === '1';
}

function writeDetailPanelCollapsed(value: boolean): void {
  window.localStorage.setItem(detailPanelCollapsedStorageKey(), value ? '1' : '0');
}

function clampDetailPanelHeight(value: number): number {
  return Math.min(DETAIL_PANEL_MAX_HEIGHT, Math.max(DETAIL_PANEL_MIN_HEIGHT, Math.round(value)));
}

function readDetailPanelHeight(): number {
  const value = Number(window.localStorage.getItem(detailPanelStorageKey()));
  if (!Number.isFinite(value)) return DETAIL_PANEL_DEFAULT_HEIGHT;
  return clampDetailPanelHeight(value);
}

function writeDetailPanelHeight(value: number): void {
  window.localStorage.setItem(detailPanelStorageKey(), String(value));
}

function startResize(event: MouseEvent): void {
  if (detailPanelCollapsed.value) return;
  dragStartY = event.clientY;
  dragStartHeight = detailPanelHeight.value;
  document.body.style.cursor = 'row-resize';
  document.body.style.userSelect = 'none';
  window.addEventListener('mousemove', resizePanel);
  window.addEventListener('mouseup', stopResize);
}

function resizePanel(event: MouseEvent): void {
  detailPanelHeight.value = clampDetailPanelHeight(dragStartHeight + dragStartY - event.clientY);
}

function stopResize(): void {
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  window.removeEventListener('mousemove', resizePanel);
  window.removeEventListener('mouseup', stopResize);
}

function toggleDetailPanelCollapsed(): void {
  detailPanelCollapsed.value = !detailPanelCollapsed.value;
}

function assetTabCount(tab: AccountAssetTab): number {
  if (tab === 'orders') return orders.value.length;
  if (tab === 'trades') return trades.value.length;
  return positions.value.length;
}

function isAssetTabLoading(tab: AccountAssetTab): boolean {
  if (tab === 'orders') return ordersLoading.value;
  if (tab === 'trades') return tradesLoading.value;
  return positionsLoading.value;
}

function clearAssetPanels(): void {
  clearOrders();
  clearTrades();
  clearPositions();
}

async function refreshSelectedAccountAssets(): Promise<void> {
  const walletId = selectedWalletId.value;
  const loadId = ++accountAssetsLoadId;
  if (!walletId) {
    clearAssetPanels();
    return;
  }

  ordersLoading.value = true;
  tradesLoading.value = true;
  positionsLoading.value = true;
  ordersError.value = '';
  tradesError.value = '';
  positionsError.value = '';

  try {
    const res = await window.api.tradingAccount.getData({ walletId });
    if (loadId !== accountAssetsLoadId || selectedWalletId.value !== walletId) return;

    if (!res.ok) {
      const message = res.error || t('common.requestFailed');
      ordersError.value = message;
      tradesError.value = message;
      positionsError.value = message;
      orders.value = [];
      trades.value = [];
      positions.value = [];
      return;
    }

    ordersConfigured.value = res.data.credentialsConfigured;
    tradesConfigured.value = res.data.credentialsConfigured;
    positionsConfigured.value = res.data.positionsConfigured;
    orders.value = res.data.orders;
    trades.value = res.data.trades;
    positions.value = res.data.positions;

    if (res.data.error) {
      ordersError.value = res.data.error;
      tradesError.value = res.data.error;
      positionsError.value = res.data.error;
    }
  } catch (err) {
    if (loadId !== accountAssetsLoadId || selectedWalletId.value !== walletId) return;
    const message = err instanceof Error ? err.message : String(err);
    ordersError.value = message;
    tradesError.value = message;
    positionsError.value = message;
    orders.value = [];
    trades.value = [];
    positions.value = [];
  } finally {
    if (loadId === accountAssetsLoadId && selectedWalletId.value === walletId) {
      ordersLoading.value = false;
      tradesLoading.value = false;
      positionsLoading.value = false;
    }
  }
}

function syncSelectedAccount(): void {
  if (accounts.value.some((account) => account.id === selectedWalletId.value)) return;
  selectedWalletId.value =
    accounts.value.find((account) => account.isDefault)?.id || accounts.value[0]?.id || '';
}

function selectAccount(account: PolymarketWalletSummary): void {
  selectedWalletId.value = account.id;
}

function handleAssetPanelError(message: string): void {
  error.value = message;
}

function closeAccountActionMenu(): void {
  accountActionMenuOpen.value = false;
}

function toggleAccountActionMenu(): void {
  accountActionMenuOpen.value = !accountActionMenuOpen.value;
}

function openCreateAccountAction(): void {
  closeAccountActionMenu();
  openCreateDialog();
}

function openCreateHdAccountAction(): void {
  closeAccountActionMenu();
  openCreateHdDialog();
}

function openImportAccountAction(): void {
  closeAccountActionMenu();
  openImportPrivateKeyDialog();
}

function openImportMnemonicAction(): void {
  closeAccountActionMenu();
  openImportMnemonicDialog();
}

function walletKeyMaterialTypeLabel(account: PolymarketWalletSummary): string {
  if (account.walletKeyMaterialType === 'mnemonic_seed') return t('account.hdWallet');
  if (account.walletKeyMaterialType === 'derived_wallet') return t('account.derivedWallet');
  return t('account.privateKeyWallet');
}

function walletKeyMaterialTypeClass(account: PolymarketWalletSummary): string {
  return account.walletKeyMaterialType === 'mnemonic_seed'
    ? 'bg-cyan-500/15 text-cyan-300'
    : 'bg-violet-500/15 text-violet-300';
}

function shouldShowWalletTypeLabel(account: PolymarketWalletSummary): boolean {
  return account.walletKeyMaterialType !== 'derived_wallet';
}

function shouldShowKeyMaterialBackupRequired(account: PolymarketWalletSummary): boolean {
  return account.walletKeyMaterialType !== 'derived_wallet' && !account.keyMaterialBackedUp;
}

function isWalletInitializing(account: PolymarketWalletSummary): boolean {
  return (
    account.initializationStatus === 'pending' ||
    account.initializationStatus === 'deriving_credentials' ||
    account.initializationStatus === 'deploying_deposit_wallet' ||
    account.initializationStatus === 'approving_polymarket'
  );
}

function walletStatusLabel(account: PolymarketWalletSummary): string {
  if (account.initializationStatus === 'pending') return t('account.initializationPending');
  if (account.initializationStatus === 'deriving_credentials') {
    return t('account.initializationDerivingCredentials');
  }
  if (account.initializationStatus === 'deploying_deposit_wallet') {
    return t('account.initializationDeployingDepositWallet');
  }
  if (account.initializationStatus === 'approving_polymarket') {
    return t('account.initializationApprovingPolymarket');
  }
  if (account.initializationStatus === 'failed') return t('account.initializationFailed');
  return account.credentialsConfigured ? t('account.tradable') : t('account.walletOnly');
}

function walletStatusTitle(account: PolymarketWalletSummary): string {
  if (account.initializationStatus === 'failed' && account.initializationError) {
    return account.initializationError;
  }
  return walletStatusLabel(account);
}

function walletStatusClass(account: PolymarketWalletSummary): string {
  if (isWalletInitializing(account)) return 'bg-sky-500/15 text-sky-300';
  if (account.initializationStatus === 'failed') return 'bg-red-500/15 text-red-300';
  return account.credentialsConfigured
    ? 'bg-emerald-500/15 text-emerald-300'
    : 'bg-amber-500/15 text-amber-300';
}

function toggleAccountExpanded(account: PolymarketWalletSummary): void {
  const next = new Set(expandedWalletIds.value);
  if (next.has(account.id)) {
    next.delete(account.id);
  } else {
    next.add(account.id);
  }
  expandedWalletIds.value = next;
}

function openAccountContextMenu(event: MouseEvent, account: PolymarketWalletSummary): void {
  contextWallet.value = account;
  accountContextMenuX.value = event.clientX;
  accountContextMenuY.value = event.clientY;
  accountContextMenuOpen.value = true;
}

function openBridgeDepositDialog(account: PolymarketWalletSummary): void {
  if (!account.depositWalletAddress) return;
  bridgeWallet.value = account;
  bridgeDepositDialogOpen.value = true;
}

function openBridgeWithdrawDialog(account: PolymarketWalletSummary): void {
  if (!account.credentialsConfigured) return;
  bridgeWallet.value = account;
  bridgeWithdrawDialogOpen.value = true;
}

function closeBridgeDepositDialog(): void {
  bridgeDepositDialogOpen.value = false;
}

function closeBridgeWithdrawDialog(): void {
  bridgeWithdrawDialogOpen.value = false;
}

function requestKeyMaterialReveal(account: PolymarketWalletSummary): void {
  keyMaterialWallet.value = account;
  keyMaterialReveal.value = null;
  resetKeyMaterialDisplay();
  keyMaterialError.value = '';
  keyMaterialConfirmOpen.value = true;
}

function cancelKeyMaterialReveal(): void {
  if (keyMaterialLoading.value) return;
  keyMaterialConfirmOpen.value = false;
  keyMaterialWallet.value = null;
  keyMaterialError.value = '';
}

async function confirmKeyMaterialReveal(): Promise<void> {
  const account = keyMaterialWallet.value;
  if (!account) return;

  keyMaterialLoading.value = true;
  keyMaterialError.value = '';
  try {
    const res = await window.api.wallet.getKeyMaterial(account.id);
    if (!res.ok) throw new Error(res.error);
    keyMaterialReveal.value = res.data;
    keyMaterialConfirmOpen.value = false;
    keyMaterialDialogOpen.value = true;
  } catch (err) {
    keyMaterialError.value = err instanceof Error ? err.message : String(err);
  } finally {
    keyMaterialLoading.value = false;
  }
}

function closeKeyMaterialDialog(): void {
  if (keyMaterialBackupSaving.value) return;
  keyMaterialDialogOpen.value = false;
  keyMaterialWallet.value = null;
  keyMaterialReveal.value = null;
  resetKeyMaterialDisplay();
  keyMaterialError.value = '';
}

function resetKeyMaterialDisplay(): void {
  keyMaterialDisplayMode.value = 'text';
  keyMaterialQrCodeUrl.value = '';
  keyMaterialQrCodeLoading.value = false;
}

function selectKeyMaterialDisplayMode(mode: KeyMaterialDisplayMode): void {
  if (keyMaterialDisplayMode.value === mode) return;

  keyMaterialDisplayMode.value = mode;
  keyMaterialError.value = '';
  if (mode === 'text') {
    keyMaterialQrCodeUrl.value = '';
    keyMaterialQrCodeLoading.value = false;
    return;
  }

  void generateKeyMaterialQrCode();
}

async function generateKeyMaterialQrCode(): Promise<void> {
  const value = keyMaterialReveal.value?.value.trim() || '';
  if (!value) return;

  keyMaterialQrCodeLoading.value = true;
  keyMaterialQrCodeUrl.value = '';
  try {
    const qrCodeUrl = await QRCode.toDataURL(value, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 260,
      color: {
        dark: '#111827',
        light: '#ffffff',
      },
    });
    if (
      keyMaterialDialogOpen.value &&
      keyMaterialDisplayMode.value === 'qr' &&
      keyMaterialReveal.value?.value.trim() === value
    ) {
      keyMaterialQrCodeUrl.value = qrCodeUrl;
    }
  } catch (err) {
    if (keyMaterialDialogOpen.value && keyMaterialDisplayMode.value === 'qr') {
      keyMaterialError.value = err instanceof Error ? err.message : String(err);
    }
  } finally {
    if (keyMaterialDisplayMode.value === 'qr') keyMaterialQrCodeLoading.value = false;
  }
}

async function confirmKeyMaterialBackedUp(): Promise<void> {
  const walletId = keyMaterialReveal.value?.walletId || keyMaterialWallet.value?.id || '';
  if (!walletId) return;

  keyMaterialBackupSaving.value = true;
  keyMaterialError.value = '';
  try {
    const res = await window.api.wallet.markKeyMaterialBackedUp(walletId);
    if (!res.ok) throw new Error(res.error);
    await loadAccounts();
    keyMaterialBackupSaving.value = false;
    closeKeyMaterialDialog();
  } catch (err) {
    keyMaterialError.value = err instanceof Error ? err.message : String(err);
  } finally {
    keyMaterialBackupSaving.value = false;
  }
}

async function copyKeyMaterial(): Promise<void> {
  const value = keyMaterialReveal.value?.value.trim();
  if (!value) return;

  try {
    await writeClipboardText(value);
  } catch (err) {
    keyMaterialError.value = err instanceof Error ? err.message : String(err);
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
    if (!document.execCommand('copy')) throw new Error(t('error.clipboardWriteFailed'));
  } finally {
    document.body.removeChild(textarea);
  }
}

function handleDocumentPointerDown(event: PointerEvent): void {
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (accountActionMenuRef.value?.contains(target)) return;
  closeAccountActionMenu();
}

function handleTradingAccountEvent(event: TradingAccountDataEvent): void {
  if (event.type === 'balance-changed') {
    updateAccountBalance(event.walletId, event.balance);
    return;
  }
  if (event.type === 'position-summary-changed') {
    updateAccountPositionSummary(event.walletId, {
      positionsTotalValue: event.positionsTotalValue,
      positionsInitialValue: event.positionsInitialValue,
    });
    return;
  }
  if (!selectedWalletId.value || event.walletId !== selectedWalletId.value) return;
  if (event.type === 'orders-changed') {
    scheduleOrdersRefresh();
    return;
  }
  if (event.type === 'trades-changed') {
    scheduleTradesRefresh();
    return;
  }
  if (event.type === 'positions-changed') {
    schedulePositionsRefresh();
  }
}

function scheduleOrdersRefresh(): void {
  if (ordersRefreshTimer) clearTimeout(ordersRefreshTimer);
  ordersRefreshTimer = setTimeout(() => {
    ordersRefreshTimer = null;
    void refreshOrders({ silent: true });
  }, 200);
}

function scheduleTradesRefresh(): void {
  if (tradesRefreshTimer) clearTimeout(tradesRefreshTimer);
  tradesRefreshTimer = setTimeout(() => {
    tradesRefreshTimer = null;
    void refreshTrades();
  }, 200);
}

function schedulePositionsRefresh(): void {
  if (positionsRefreshTimer) clearTimeout(positionsRefreshTimer);
  positionsRefreshTimer = setTimeout(() => {
    positionsRefreshTimer = null;
    void refreshPositions();
  }, 200);
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown);
  unsubscribeTradingAccountEvent = window.api.tradingAccount.onEvent(handleTradingAccountEvent);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown);
  unsubscribeTradingAccountEvent?.();
  if (ordersRefreshTimer) clearTimeout(ordersRefreshTimer);
  if (tradesRefreshTimer) clearTimeout(tradesRefreshTimer);
  if (positionsRefreshTimer) clearTimeout(positionsRefreshTimer);
  stopResize();
});

watch(
  accounts,
  () => {
    const childParentIds = new Set(
      accounts.value
        .map((account) => account.parentWalletId)
        .filter((parentWalletId): parentWalletId is string => Boolean(parentWalletId)),
    );
    const nextExpandedAccountIds = new Set(expandedWalletIds.value);
    for (const account of accounts.value) {
      if (account.walletKeyMaterialType === 'mnemonic_seed' && childParentIds.has(account.id)) {
        nextExpandedAccountIds.add(account.id);
      }
    }
    expandedWalletIds.value = nextExpandedAccountIds;
    syncSelectedAccount();
  },
  { immediate: true },
);

watch(selectedWalletId, () => {
  clearAssetPanels();
  void refreshSelectedAccountAssets();
});

watch(detailPanelHeight, (next) => writeDetailPanelHeight(next));

watch(detailPanelCollapsed, (next) => writeDetailPanelCollapsed(next));
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div
      class="border-border bg-surface flex shrink-0 items-center justify-between border-b px-6 py-4"
    >
      <div>
        <h1 class="text-lg font-semibold text-white">{{ t('nav.accountManagement') }}</h1>
        <p v-if="error" class="mt-1 text-sm text-red-400">{{ error }}</p>
        <p v-else class="text-muted mt-1 text-sm">
          {{ t('count.items', { count: accounts.length }) }}
        </p>
      </div>
      <div ref="accountActionMenuRef" class="relative" @keydown.esc="closeAccountActionMenu">
        <div class="inline-flex">
          <button
            type="button"
            class="bg-primary hover:bg-primary-hover inline-flex h-9 items-center gap-2 rounded-l-md px-3 text-sm font-medium text-white transition-colors disabled:opacity-50"
            :title="walletLimitReached ? walletLimitMessage : t('account.create')"
            :aria-label="walletLimitReached ? walletLimitMessage : t('account.create')"
            :disabled="saving || walletLimitReached"
            @click="openCreateAccountAction"
          >
            <Plus :size="14" />
            {{ t('account.create') }}
          </button>
          <button
            type="button"
            class="bg-primary hover:bg-primary-hover border-primary-hover inline-flex h-9 w-9 items-center justify-center rounded-r-md border-l text-white transition-colors disabled:opacity-50"
            :title="t('account.accountActions')"
            :aria-label="t('account.accountActions')"
            aria-haspopup="menu"
            :aria-expanded="accountActionMenuOpen"
            :disabled="saving"
            @click="toggleAccountActionMenu"
          >
            <ChevronDown
              :size="15"
              class="transition-transform"
              :class="{ 'rotate-180': accountActionMenuOpen }"
            />
          </button>
        </div>
        <Transition name="account-action-menu">
          <div
            v-if="accountActionMenuOpen"
            class="border-border bg-surface app-no-drag absolute top-[calc(100%+6px)] right-0 z-30 w-44 overflow-hidden rounded-md border py-1 shadow-xl shadow-black/35"
            role="menu"
          >
            <button
              type="button"
              class="text-text hover:bg-btn-secondary flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
              role="menuitem"
              :title="walletLimitReached ? walletLimitMessage : t('account.create')"
              :aria-label="walletLimitReached ? walletLimitMessage : t('account.create')"
              :disabled="walletLimitReached"
              @click="openCreateAccountAction"
            >
              <Plus :size="14" />
              {{ t('account.create') }}
            </button>
            <button
              type="button"
              class="text-text hover:bg-btn-secondary flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
              role="menuitem"
              :title="walletLimitReached ? walletLimitMessage : t('account.createHd')"
              :aria-label="walletLimitReached ? walletLimitMessage : t('account.createHd')"
              :disabled="walletLimitReached"
              @click="openCreateHdAccountAction"
            >
              <Plus :size="14" />
              {{ t('account.createHd') }}
            </button>
            <button
              type="button"
              class="text-text hover:bg-btn-secondary flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
              role="menuitem"
              :title="walletLimitReached ? walletLimitMessage : t('account.importPrivateKey')"
              :aria-label="walletLimitReached ? walletLimitMessage : t('account.importPrivateKey')"
              :disabled="walletLimitReached"
              @click="openImportAccountAction"
            >
              <Upload :size="14" />
              {{ t('account.importPrivateKey') }}
            </button>
            <button
              type="button"
              class="text-text hover:bg-btn-secondary flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
              role="menuitem"
              :title="walletLimitReached ? walletLimitMessage : t('account.importMnemonic')"
              :aria-label="walletLimitReached ? walletLimitMessage : t('account.importMnemonic')"
              :disabled="walletLimitReached"
              @click="openImportMnemonicAction"
            >
              <Upload :size="14" />
              {{ t('account.importMnemonic') }}
            </button>
          </div>
        </Transition>
      </div>
    </div>

    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div v-if="loading" class="flex min-h-0 flex-1 items-center justify-center">
        <LoadingSpinner :size="24" :title="t('common.loading')" />
      </div>

      <div
        v-else-if="!accounts.length"
        class="flex min-h-0 flex-1 items-center justify-center px-8 py-12"
      >
        <div class="flex max-w-md flex-col items-center text-center">
          <div
            class="border-border bg-surface text-primary-light mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border"
          >
            <Wallet :size="30" aria-hidden="true" />
          </div>
          <h2 class="text-lg font-semibold text-white">{{ t('account.emptyTitle') }}</h2>
          <p class="text-muted mt-2 text-sm leading-6">
            {{ t('account.emptyDescription') }}
          </p>
          <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              class="bg-primary hover:bg-primary-hover inline-flex h-9 items-center gap-2 rounded-md px-4 text-sm font-medium text-white transition-colors disabled:opacity-50"
              :disabled="saving"
              @click="openCreateAccountAction"
            >
              <Plus :size="15" aria-hidden="true" />
              {{ t('account.create') }}
            </button>
            <button
              type="button"
              class="border-border bg-surface text-text hover:bg-btn-secondary inline-flex h-9 items-center gap-2 rounded-md border px-4 text-sm font-medium transition-colors disabled:opacity-50"
              :disabled="saving"
              @click="openImportAccountAction"
            >
              <Upload :size="15" aria-hidden="true" />
              {{ t('account.importExistingWallet') }}
            </button>
          </div>
        </div>
      </div>

      <section v-else class="min-h-0 flex-1 overflow-auto">
        <table class="w-full border-collapse">
          <thead class="bg-surface sticky top-0 z-10">
            <tr>
              <th
                class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
              >
                {{ t('common.name') }}
              </th>
              <th
                class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
              >
                {{ t('account.eoaWallet') }}
              </th>
              <th
                class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
              >
                {{ t('account.depositWallet') }}
              </th>
              <th
                class="border-border text-muted border-b px-4 py-2.5 text-center text-xs font-semibold uppercase"
              >
                {{ t('common.status') }}
              </th>
              <th
                class="border-border text-muted border-b px-4 py-2.5 text-right text-xs font-semibold"
              >
                {{ t('account.pusd') }}
              </th>
              <th
                class="border-border text-muted border-b px-4 py-2.5 text-right text-xs font-semibold uppercase"
              >
                {{ t('position.value') }}
              </th>
              <th
                class="border-border text-muted border-b px-4 py-2.5 text-right text-xs font-semibold uppercase"
              >
                {{ t('position.pnl') }}
              </th>
              <th
                class="border-border text-muted border-b px-4 py-2.5 text-center text-xs font-semibold uppercase"
              >
                {{ t('account.default') }}
              </th>
              <th
                class="border-border text-muted w-[132px] border-b px-4 py-2.5 text-center text-xs font-semibold uppercase"
              >
                {{ t('common.actions') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="{ account, depth, hasChildren } in accountRows"
              :key="account.id"
              class="border-border/60 cursor-pointer border-b hover:bg-[#1a1a2e]"
              :class="selectedWalletId === account.id ? 'bg-primary/10' : ''"
              @click="selectAccount(account)"
              @contextmenu.prevent="openAccountContextMenu($event, account)"
            >
              <td class="px-4 py-3 text-sm font-medium text-white">
                <span
                  class="inline-flex min-w-0 items-center gap-2"
                  :style="{ paddingLeft: `${depth * 22}px` }"
                >
                  <button
                    v-if="hasChildren"
                    type="button"
                    class="text-muted hover:text-text inline-flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-[#23233a]"
                    :title="
                      expandedWalletIds.has(account.id)
                        ? t('account.collapseDerived')
                        : t('account.expandDerived')
                    "
                    @click.stop="toggleAccountExpanded(account)"
                  >
                    <ChevronDown v-if="expandedWalletIds.has(account.id)" :size="14" />
                    <ChevronRight v-else :size="14" />
                  </button>
                  <span v-else class="h-5 w-5 shrink-0" />
                  <span class="truncate">{{ account.name }}</span>
                  <span
                    v-if="shouldShowWalletTypeLabel(account)"
                    class="inline-flex shrink-0 rounded px-1.5 py-0.5 text-[11px] font-normal"
                    :class="walletKeyMaterialTypeClass(account)"
                  >
                    {{ walletKeyMaterialTypeLabel(account) }}
                  </span>
                  <span
                    v-if="shouldShowKeyMaterialBackupRequired(account)"
                    class="inline-flex shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-normal text-amber-300"
                    :title="t('account.keyMaterialBackupRequiredTitle')"
                  >
                    {{ t('account.keyMaterialBackupRequired') }}
                  </span>
                </span>
              </td>
              <td
                class="selectable-text text-muted px-4 py-3 font-mono text-xs"
                :title="account.walletAddress"
              >
                {{ formatAddress(account.walletAddress) }}
              </td>
              <td
                class="selectable-text text-muted max-w-[280px] px-4 py-3 font-mono text-xs"
                :title="account.depositWalletAddress"
              >
                {{ formatAddress(account.depositWalletAddress) }}
              </td>
              <td class="px-4 py-3 text-center">
                <span
                  class="inline-flex items-center justify-center gap-1.5 rounded px-2 py-1 text-xs"
                  :class="walletStatusClass(account)"
                  :title="walletStatusTitle(account)"
                >
                  <LoaderCircle
                    v-if="isWalletInitializing(account)"
                    :size="13"
                    class="animate-spin"
                  />
                  <span>{{ walletStatusLabel(account) }}</span>
                </span>
              </td>
              <td
                class="px-4 py-3 text-right font-mono text-xs"
                :class="account.credentialsConfigured ? 'text-text' : 'text-muted'"
                :title="balanceTitle(account)"
              >
                <span
                  v-if="isBalanceLoading(account)"
                  class="text-muted-light inline-flex items-center justify-end"
                  :title="t('account.loadingBalance')"
                >
                  <LoaderCircle :size="15" class="animate-spin" />
                </span>
                <template v-else>{{ renderBalance(account) }}</template>
              </td>
              <td class="px-4 py-3 text-right font-mono text-xs">
                <span
                  v-if="isPositionSummaryLoading(account)"
                  class="text-muted-light inline-flex items-center justify-end"
                  :title="t('position.loadPositions')"
                >
                  <LoaderCircle :size="15" class="animate-spin" />
                </span>
                <template v-else>{{ renderPositionsTotalValue(account) }}</template>
              </td>
              <td class="px-4 py-3 text-right font-mono text-xs" :class="positionPnlClass(account)">
                <span
                  v-if="isPositionSummaryLoading(account)"
                  class="text-muted-light inline-flex items-center justify-end"
                  :title="t('position.loadPositions')"
                >
                  <LoaderCircle :size="15" class="animate-spin" />
                </span>
                <template v-else>{{ renderPositionsPnl(account) }}</template>
              </td>
              <td class="px-4 py-3 text-center">
                <span
                  v-if="account.isDefault"
                  class="bg-primary/20 text-primary-light rounded px-2 py-1 text-xs"
                  >{{ t('account.default') }}</span
                >
                <button
                  v-else
                  type="button"
                  class="text-muted border-border hover:text-text inline-flex items-center justify-center rounded border px-2 py-1 transition-colors"
                  :title="t('account.setDefaultAccount')"
                  @click.stop="setDefault(account.id)"
                >
                  <Star :size="13" />
                </button>
              </td>
              <td class="px-4 py-3 text-center">
                <div class="inline-flex items-center justify-center gap-1">
                  <button
                    type="button"
                    class="border-border text-muted hover:text-text inline-flex h-7 w-7 items-center justify-center rounded border transition-colors hover:bg-[#23233a] disabled:cursor-not-allowed disabled:opacity-40"
                    :title="
                      account.depositWalletAddress
                        ? t('bridge.deposit')
                        : t('account.noDepositWalletAddress')
                    "
                    :aria-label="
                      account.depositWalletAddress
                        ? t('bridge.deposit')
                        : t('account.noDepositWalletAddress')
                    "
                    :disabled="!account.depositWalletAddress"
                    @click.stop="openBridgeDepositDialog(account)"
                  >
                    <Download :size="13" />
                  </button>
                  <button
                    type="button"
                    class="border-border text-muted hover:text-text inline-flex h-7 w-7 items-center justify-center rounded border transition-colors hover:bg-[#23233a] disabled:cursor-not-allowed disabled:opacity-40"
                    :title="
                      account.credentialsConfigured
                        ? t('bridge.withdraw')
                        : t('tradingWindow.credentialsRequired')
                    "
                    :aria-label="
                      account.credentialsConfigured
                        ? t('bridge.withdraw')
                        : t('tradingWindow.credentialsRequired')
                    "
                    :disabled="!account.credentialsConfigured"
                    @click.stop="openBridgeWithdrawDialog(account)"
                  >
                    <Upload :size="13" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section
        v-if="!loading && accounts.length"
        class="border-border bg-detail-bg flex shrink-0 flex-col overflow-hidden border-t"
        :style="detailPanelCollapsed ? undefined : { height: `${detailPanelHeight}px` }"
      >
        <div
          v-if="!detailPanelCollapsed"
          class="group h-1.5 shrink-0 cursor-row-resize"
          :title="t('account.resizeDetailPanel')"
          @mousedown="startResize"
        >
          <div class="group-hover:bg-primary/70 mx-auto h-0.5 w-16 rounded-full bg-transparent" />
        </div>

        <div
          class="border-border flex shrink-0 items-center justify-between gap-2 border-b px-2 py-2"
        >
          <div class="flex min-w-0 items-center gap-1 overflow-x-auto">
            <button
              v-for="tab in assetTabs"
              :key="tab.id"
              type="button"
              class="inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm transition-colors"
              :class="
                activeAssetTab === tab.id
                  ? 'bg-btn-secondary-hover text-white'
                  : 'text-muted-light hover:bg-btn-secondary hover:text-text'
              "
              @click="activeAssetTab = tab.id"
            >
              <component :is="tab.icon" :size="14" />
              <span>{{ t(tab.label) }}</span>
              <LoadingSpinner
                v-if="isAssetTabLoading(tab.id)"
                :size="13"
                :title="t('account.loadTab', { label: t(tab.label) })"
              />
              <span
                v-else
                class="inline-flex min-h-4 min-w-4 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] leading-none"
                :class="
                  activeAssetTab === tab.id
                    ? 'bg-primary/30 text-primary-light'
                    : 'bg-bg text-muted'
                "
              >
                {{ assetTabCount(tab.id) }}
              </span>
            </button>
          </div>

          <div class="flex shrink-0 items-center gap-2">
            <button
              type="button"
              class="hover:bg-btn-secondary text-muted-light inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:text-white"
              :title="
                detailPanelCollapsed
                  ? t('account.expandDetailPanel')
                  : t('account.collapseDetailPanel')
              "
              @click="toggleDetailPanelCollapsed"
            >
              <PanelBottomOpen v-if="detailPanelCollapsed" :size="16" />
              <PanelBottomClose v-else :size="16" />
            </button>
          </div>
        </div>

        <div
          v-if="!detailPanelCollapsed && !selectedAccount"
          class="text-muted flex flex-1 items-center justify-center text-sm"
        >
          {{ t('account.selectHint') }}
        </div>
        <WalletOrdersPanel
          v-else-if="!detailPanelCollapsed && activeAssetTab === 'orders'"
          :wallet-id="selectedWalletId"
          :orders="orders"
          :loading="ordersLoading"
          :error="ordersError"
          :configured="ordersConfigured"
          @refresh="refreshOrders"
          @error="handleAssetPanelError"
        />
        <WalletTradesPanel
          v-else-if="!detailPanelCollapsed && activeAssetTab === 'trades'"
          :wallet-id="selectedWalletId"
          :trades="trades"
          :loading="tradesLoading"
          :error="tradesError"
          :configured="tradesConfigured"
          @error="handleAssetPanelError"
        />
        <WalletPositionsPanel
          v-else-if="!detailPanelCollapsed"
          :wallet-id="selectedWalletId"
          :positions="positions"
          :loading="positionsLoading"
          :error="positionsError"
          :configured="positionsConfigured"
          @error="handleAssetPanelError"
        />
      </section>
    </div>

    <ContextMenu
      v-model:open="accountContextMenuOpen"
      :x="accountContextMenuX"
      :y="accountContextMenuY"
      :items="accountContextMenuItems"
      @close="contextWallet = null"
    />

    <WalletDepositDialog
      :open="bridgeDepositDialogOpen"
      :wallet="bridgeWallet"
      @close="closeBridgeDepositDialog"
    />
    <WalletWithdrawDialog
      :open="bridgeWithdrawDialogOpen"
      :wallet="bridgeWallet"
      @close="closeBridgeWithdrawDialog"
      @submitted="loadAccounts"
    />

    <Transition name="delete-dialog">
      <div
        v-if="keyMaterialConfirmOpen"
        class="app-no-drag fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4"
        @click.self="cancelKeyMaterialReveal"
      >
        <section
          class="border-border bg-surface w-full max-w-[460px] rounded-lg border shadow-2xl shadow-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="key-material-confirm-title"
        >
          <header class="border-border flex items-center gap-3 border-b px-5 py-4">
            <span
              class="text-danger flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#43212a]"
            >
              <AlertTriangle :size="19" :stroke-width="2.2" />
            </span>
            <div class="min-w-0 flex-1">
              <h2 id="key-material-confirm-title" class="text-[15px] font-semibold text-white">
                {{ t('account.revealSecurityTitle') }}
              </h2>
              <p class="text-muted-light mt-1 text-[12px]">
                {{ t('account.revealSecuritySubtitle') }}
              </p>
            </div>
            <button
              type="button"
              class="text-muted-light hover:bg-btn-secondary inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:text-white disabled:opacity-50"
              :title="t('common.cancel')"
              :disabled="keyMaterialLoading"
              @click="cancelKeyMaterialReveal"
            >
              <X :size="16" />
            </button>
          </header>

          <div class="px-5 py-4">
            <p class="text-text text-[13px] leading-6">
              {{ t('account.revealSecurityMessage', { name: keyMaterialWallet?.name || '' }) }}
            </p>
            <p
              v-if="keyMaterialError"
              class="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
            >
              {{ keyMaterialError }}
            </p>
          </div>

          <footer class="flex justify-end gap-2 px-5 pb-5">
            <button
              type="button"
              class="bg-btn-secondary hover:bg-btn-secondary-hover inline-flex h-9 items-center rounded-md px-4 text-[13px] font-medium text-white transition-colors disabled:opacity-50"
              :disabled="keyMaterialLoading"
              @click="cancelKeyMaterialReveal"
            >
              {{ t('common.cancel') }}
            </button>
            <button
              type="button"
              class="bg-danger inline-flex h-9 items-center gap-2 rounded-md px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#c92f3a] disabled:opacity-50"
              :disabled="keyMaterialLoading"
              @click="confirmKeyMaterialReveal"
            >
              <LoaderCircle v-if="keyMaterialLoading" :size="15" class="animate-spin" />
              <template v-else>{{ t('account.revealConfirm') }}</template>
            </button>
          </footer>
        </section>
      </div>
    </Transition>

    <Transition name="account-dialog">
      <div
        v-if="keyMaterialDialogOpen"
        class="app-no-drag fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4"
      >
        <section
          class="border-border bg-surface w-full max-w-[560px] rounded-lg border shadow-2xl shadow-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="key-material-dialog-title"
        >
          <header
            class="border-border flex shrink-0 items-center justify-between gap-4 border-b px-5 py-4"
          >
            <div>
              <h2 id="key-material-dialog-title" class="text-[15px] font-semibold text-white">
                {{ keyMaterialDialogTitle }}
              </h2>
              <p class="text-muted-light mt-1 text-[12px]">{{ keyMaterialWallet?.name }}</p>
            </div>
          </header>

          <div class="px-5 py-4">
            <div
              class="bg-bg mb-4 grid grid-cols-2 rounded-md p-1"
              role="tablist"
              :aria-label="t('account.keyMaterialDisplayMode')"
            >
              <button
                type="button"
                role="tab"
                class="h-8 rounded text-[13px] font-medium transition-colors"
                :class="
                  keyMaterialDisplayMode === 'text'
                    ? 'bg-btn-secondary text-white shadow-sm'
                    : 'text-muted-light hover:text-white'
                "
                :aria-selected="keyMaterialDisplayMode === 'text'"
                @click="selectKeyMaterialDisplayMode('text')"
              >
                {{ t('account.keyMaterialText') }}
              </button>
              <button
                type="button"
                role="tab"
                class="h-8 rounded text-[13px] font-medium transition-colors"
                :class="
                  keyMaterialDisplayMode === 'qr'
                    ? 'bg-btn-secondary text-white shadow-sm'
                    : 'text-muted-light hover:text-white'
                "
                :aria-selected="keyMaterialDisplayMode === 'qr'"
                @click="selectKeyMaterialDisplayMode('qr')"
              >
                {{ t('account.keyMaterialQrCode') }}
              </button>
            </div>
            <textarea
              v-if="keyMaterialDisplayMode === 'text'"
              class="border-border bg-bg text-text h-28 w-full resize-none rounded-md border px-3 py-2 font-mono text-xs outline-none"
              readonly
              :aria-label="keyMaterialDialogTitle"
              :value="keyMaterialReveal?.value || ''"
            />
            <div v-else class="flex flex-col items-center gap-3">
              <img
                v-if="keyMaterialQrCodeUrl"
                :src="keyMaterialQrCodeUrl"
                class="h-[260px] w-[260px] rounded-md bg-white p-2"
                :alt="t('account.keyMaterialQrCode')"
              />
              <div
                v-else
                class="border-border text-muted-light flex h-[260px] w-[260px] items-center justify-center rounded-md border"
              >
                <LoaderCircle
                  v-if="keyMaterialQrCodeLoading"
                  :size="22"
                  class="animate-spin"
                  :title="t('account.keyMaterialQrCode')"
                />
              </div>
              <p class="text-danger text-center text-xs leading-5">
                {{ t('account.keyMaterialQrWarning') }}
              </p>
            </div>
            <p
              v-if="keyMaterialError"
              class="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
            >
              {{ keyMaterialError }}
            </p>
          </div>

          <footer class="border-border flex shrink-0 justify-between gap-2 border-t px-5 py-4">
            <button
              type="button"
              class="bg-primary hover:bg-primary-hover inline-flex h-9 items-center gap-2 rounded-md px-4 text-[13px] font-medium text-white transition-colors"
              :disabled="keyMaterialBackupSaving"
              @click="copyKeyMaterial"
            >
              <Copy :size="15" />
              {{ t('common.copy') }}
            </button>
            <button
              type="button"
              class="bg-btn-secondary hover:bg-btn-secondary-hover inline-flex h-9 items-center gap-2 rounded-md px-4 text-[13px] font-medium text-white transition-colors disabled:opacity-50"
              :disabled="keyMaterialBackupSaving"
              @click="confirmKeyMaterialBackedUp"
            >
              <LoaderCircle v-if="keyMaterialBackupSaving" :size="15" class="animate-spin" />
              <template v-else>{{ t('account.keyMaterialBackedUpConfirm') }}</template>
            </button>
          </footer>
        </section>
      </div>
    </Transition>

    <Transition name="account-dialog">
      <div
        v-if="showCreateDialog"
        class="app-no-drag fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4"
        @click.self="closeCreateDialog"
        @keydown.esc="closeCreateDialog"
      >
        <form
          class="border-border bg-surface flex max-h-[calc(100vh-48px)] w-full max-w-[560px] flex-col rounded-lg border shadow-2xl shadow-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="account-dialog-title"
          @submit.prevent="saveAccount"
        >
          <header
            class="border-border flex shrink-0 items-center justify-between gap-4 border-b px-5 py-4"
          >
            <div>
              <h2 id="account-dialog-title" class="text-[15px] font-semibold text-white">
                {{ dialogTitle }}
              </h2>
              <p class="text-muted-light mt-1 text-[12px]">{{ dialogDescription }}</p>
            </div>
            <button
              type="button"
              class="text-muted-light hover:bg-btn-secondary inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:text-white disabled:opacity-50"
              :title="t('common.close')"
              :disabled="saving"
              @click="closeCreateDialog"
            >
              <X :size="16" />
            </button>
          </header>

          <div class="min-h-0 overflow-auto px-5 py-4">
            <p
              v-if="dialogError"
              class="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
            >
              {{ dialogError }}
            </p>
            <div class="space-y-3">
              <label class="block text-sm">
                <span class="text-muted mb-1 block">{{ t('common.name') }}</span>
                <input
                  v-model="form.name"
                  class="border-border bg-bg text-text focus:border-primary w-full rounded-md border px-3 py-2 outline-none"
                  @focus="handleNameFocus"
                />
              </label>
              <label v-if="dialogMode === 'importPrivateKey'" class="block text-sm">
                <span class="text-muted mb-1 block">Private Key</span>
                <input
                  v-model="form.privateKey"
                  type="password"
                  class="border-border bg-bg text-text focus:border-primary w-full rounded-md border px-3 py-2 outline-none"
                />
              </label>
              <label v-if="dialogMode === 'importMnemonic'" class="block text-sm">
                <span class="text-muted mb-1 block">{{ t('account.mnemonic') }}</span>
                <textarea
                  v-model="form.mnemonic"
                  rows="4"
                  class="border-border bg-bg text-text focus:border-primary w-full resize-none rounded-md border px-3 py-2 outline-none"
                />
              </label>
              <label v-if="dialogMode === 'edit'" class="block text-sm">
                <span class="text-muted mb-1 block">Relayer API Key</span>
                <input
                  v-model="form.relayerApiKey"
                  type="password"
                  :placeholder="t('account.leaveBlankUnchanged')"
                  class="border-border bg-bg text-text focus:border-primary w-full rounded-md border px-3 py-2 outline-none"
                />
              </label>
              <label class="text-text flex items-center gap-2 text-sm">
                <input
                  v-model="form.isDefault"
                  type="checkbox"
                  class="accent-primary h-4 w-4 disabled:cursor-not-allowed disabled:opacity-60"
                  :disabled="isFirstAccountDefaultLocked"
                  :title="
                    isFirstAccountDefaultLocked
                      ? t('account.firstAccountDefaultRequired')
                      : t('account.setDefaultAccount')
                  "
                  :aria-label="
                    isFirstAccountDefaultLocked
                      ? t('account.firstAccountDefaultRequired')
                      : t('account.setDefaultAccount')
                  "
                />
                {{ t('account.setDefaultAccount') }}
              </label>
            </div>
          </div>

          <footer class="border-border flex shrink-0 justify-end gap-2 border-t px-5 py-4">
            <button
              type="button"
              class="bg-btn-secondary hover:bg-btn-secondary-hover inline-flex h-9 items-center rounded-md px-4 text-[13px] font-medium text-white transition-colors disabled:opacity-50"
              :disabled="saving"
              @click="closeCreateDialog"
            >
              {{ t('common.cancel') }}
            </button>
            <button
              type="submit"
              class="bg-primary hover:bg-primary-hover inline-flex h-9 items-center gap-2 rounded-md px-4 text-[13px] font-medium text-white transition-colors disabled:opacity-50"
              :disabled="saving"
            >
              <LoaderCircle v-if="saving" :size="15" class="animate-spin" />
              <Save v-else :size="15" />
              {{ dialogSubmitLabel }}
            </button>
          </footer>
        </form>
      </div>
    </Transition>

    <Transition name="delete-dialog">
      <div
        v-if="deleteConfirmOpen"
        class="app-no-drag fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4"
        @click.self="cancelDeleteAccount"
      >
        <section
          class="border-border bg-surface w-full max-w-[420px] rounded-lg border shadow-2xl shadow-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-dialog-title"
        >
          <header class="border-border flex items-center gap-3 border-b px-5 py-4">
            <span
              class="text-danger flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#43212a]"
            >
              <AlertTriangle :size="19" :stroke-width="2.2" />
            </span>
            <div class="min-w-0 flex-1">
              <h2 id="delete-account-dialog-title" class="text-[15px] font-semibold text-white">
                {{ t('account.deleteTitle') }}
              </h2>
              <p class="text-muted-light mt-1 text-[12px]">{{ t('account.deleteSubtitle') }}</p>
            </div>
            <button
              type="button"
              class="text-muted-light hover:bg-btn-secondary inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:text-white disabled:opacity-50"
              :title="t('common.cancel')"
              :disabled="deleting"
              @click="cancelDeleteAccount"
            >
              <X :size="16" />
            </button>
          </header>

          <div class="px-5 py-4">
            <p class="text-text text-[13px] leading-6">
              {{ t('account.deleteMessage', { name: deletingWallet?.name || '' }) }}
            </p>
            <label
              for="delete-account-confirmation-name"
              class="text-text mt-4 block text-[13px] font-medium"
            >
              {{ t('account.deleteConfirmationLabel') }}
            </label>
            <p class="text-muted-light mt-1 text-[12px] leading-5">
              {{
                t('account.deleteConfirmationHint', {
                  name: deletingWallet?.name || '',
                })
              }}
            </p>
            <input
              id="delete-account-confirmation-name"
              v-model="deleteConfirmationName"
              type="text"
              class="border-border bg-input text-text focus:border-primary mt-2 h-9 w-full rounded-md border px-3 text-[13px] transition-colors outline-none"
              :placeholder="t('account.deleteConfirmationPlaceholder')"
              :disabled="deleting"
              autocomplete="off"
              spellcheck="false"
              autofocus
              @keydown.enter.prevent="confirmDeleteAccount"
            />
            <p
              v-if="deleteConfirmError"
              class="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
            >
              {{ deleteConfirmError }}
            </p>
          </div>

          <footer class="flex justify-end gap-2 px-5 pb-5">
            <button
              type="button"
              class="bg-btn-secondary hover:bg-btn-secondary-hover inline-flex h-9 items-center rounded-md px-4 text-[13px] font-medium text-white transition-colors disabled:opacity-50"
              :disabled="deleting"
              @click="cancelDeleteAccount"
            >
              {{ t('common.cancel') }}
            </button>
            <button
              type="button"
              class="bg-danger inline-flex h-9 items-center rounded-md px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#c92f3a] disabled:opacity-50"
              :disabled="deleting || !isDeleteConfirmationValid"
              @click="confirmDeleteAccount"
            >
              <LoaderCircle v-if="deleting" :size="15" class="animate-spin" />
              <template v-else>{{ t('common.delete') }}</template>
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.account-dialog-enter-active,
.account-dialog-leave-active,
.delete-dialog-enter-active,
.delete-dialog-leave-active,
.account-action-menu-enter-active,
.account-action-menu-leave-active {
  transition: opacity 130ms ease;
}

.account-dialog-enter-active form,
.account-dialog-enter-active section,
.account-dialog-leave-active form,
.account-dialog-leave-active section,
.delete-dialog-enter-active section,
.delete-dialog-leave-active section,
.account-action-menu-enter-active,
.account-action-menu-leave-active {
  transition:
    opacity 130ms ease,
    transform 130ms ease;
}

.account-dialog-enter-from,
.account-dialog-leave-to,
.delete-dialog-enter-from,
.delete-dialog-leave-to,
.account-action-menu-enter-from,
.account-action-menu-leave-to {
  opacity: 0;
}

.account-dialog-enter-from form,
.account-dialog-enter-from section,
.account-dialog-leave-to form,
.account-dialog-leave-to section,
.delete-dialog-enter-from section,
.delete-dialog-leave-to section,
.account-action-menu-enter-from,
.account-action-menu-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}
</style>
