<script setup lang="ts">
import { Combine, RefreshCcw, Scissors, Zap } from '@lucide/vue';
import type { DataPosition, PolymarketWalletSummary } from '@polytrader/shared';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  formatNumber,
  formatPercent,
  formatPnl,
  formatPrice,
  formatUsd,
} from '@/shared/utils/format';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';
import MergePositionsPopover from './MergePositionsPopover.vue';
import SplitPositionPopover from './SplitPositionPopover.vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  positions: DataPosition[];
  accounts: PolymarketWalletSummary[];
  selectedWalletId: string;
  conditionId: string;
  marketNegRisk: boolean;
  loading?: boolean;
  error?: string;
  embedded?: boolean;
}>();

const { t } = useI18n();

const leftPositionActions = [
  {
    key: 'split',
    labelKey: 'position.actionSplit',
    titleKey: 'position.actionSplitTitle',
    icon: Scissors,
  },
  {
    key: 'merge',
    labelKey: 'position.actionMerge',
    titleKey: 'position.actionMergeTitle',
    icon: Combine,
  },
] as const;

const rightPositionActions = [
  {
    key: 'redeem',
    labelKey: 'position.actionRedeem',
    titleKey: 'position.actionRedeemTitle',
    icon: RefreshCcw,
  },
  {
    key: 'quickSell',
    labelKey: 'position.actionQuickSell',
    titleKey: 'position.actionQuickSellTitle',
    icon: Zap,
  },
] as const;

const COLLATERAL_DECIMALS = 6;
const COLLATERAL_SCALE = 10n ** BigInt(COLLATERAL_DECIMALS);
const AMOUNT_PATTERN = /^\d+(?:\.\d{1,6})?$/;

const selectedPositionKeys = ref<Set<string>>(new Set());
const actionPopover = ref<'split' | 'merge' | null>(null);
const splitAmount = ref('');
const splitSubmitting = ref(false);
const splitError = ref('');
const splitErrorDetail = ref('');
const mergeAmount = ref('');
const mergeSubmitting = ref(false);
const mergeError = ref('');
const mergeErrorDetail = ref('');
const actionButtonEls = ref(new Map<string, HTMLElement>());
const splitPopoverEl = ref<{ contains(target: Node): boolean } | null>(null);
const mergePopoverEl = ref<{ contains(target: Node): boolean } | null>(null);
const actionPopoverPosition = ref({ left: 0, top: 0 });

const visiblePositionKeys = computed(() =>
  props.positions.map((position, index) => positionSelectionKey(position, index)),
);

const allVisiblePositionsSelected = computed(
  () =>
    visiblePositionKeys.value.length > 0 &&
    visiblePositionKeys.value.every((key) => selectedPositionKeys.value.has(key)),
);

const someVisiblePositionsSelected = computed(
  () =>
    visiblePositionKeys.value.some((key) => selectedPositionKeys.value.has(key)) &&
    !allVisiblePositionsSelected.value,
);

const selectedVisiblePositionCount = computed(
  () => visiblePositionKeys.value.filter((key) => selectedPositionKeys.value.has(key)).length,
);

const selectedVisiblePositions = computed(() =>
  props.positions.filter((position, index) =>
    selectedPositionKeys.value.has(positionSelectionKey(position, index)),
  ),
);

const mergeAmountMax = computed(() => {
  if (selectedVisiblePositions.value.length !== 2) return 0;
  return Math.min(...selectedVisiblePositions.value.map((position) => positionSize(position)));
});

const actionPopoverStyle = computed(() => ({
  left: `${actionPopoverPosition.value.left}px`,
  top: `${actionPopoverPosition.value.top}px`,
}));

const selectedAccount = computed(
  () =>
    props.accounts.find((account) => account.id === props.selectedWalletId) ??
    props.accounts[0] ??
    null,
);

const selectedAccountBalanceBaseUnits = computed(() =>
  accountBalanceBaseUnits(selectedAccount.value),
);

const splitAmountMax = computed(() => {
  const balance = selectedAccountBalanceBaseUnits.value;
  return balance == null ? 0 : baseUnitsToNumber(balance);
});

const splitAmountMaxLabel = computed(() => {
  const balance = selectedAccountBalanceBaseUnits.value;
  return balance == null ? '—' : formatNumber(baseUnitsToNumber(balance), 2);
});

const splitAmountVisibleError = computed(() => {
  if (!splitAmount.value.trim()) return '';
  return validateSplitAmount();
});

const mergeAmountVisibleError = computed(() => {
  if (!mergeAmount.value.trim()) return '';
  return validateMergeAmount();
});

const splitConfirmDisabled = computed(
  () => splitSubmitting.value || Boolean(validateSplitAmount()),
);

const mergeConfirmDisabled = computed(
  () => mergeSubmitting.value || Boolean(validateMergeAmount()),
);

const selectedAccountName = computed(() =>
  selectedAccount.value
    ? accountDisplayName(selectedAccount.value)
    : t('tradingWindow.noTradableAccounts'),
);

const selectedAccountBalanceLabel = computed(() =>
  selectedAccount.value ? accountBalanceLabel(selectedAccount.value) : '—',
);

function positionSelectionKey(position: DataPosition, index: number): string {
  return `${position.conditionId}-${position.outcomeIndex}-${position.asset ?? index}`;
}

function isPositionSelected(position: DataPosition, index: number): boolean {
  return selectedPositionKeys.value.has(positionSelectionKey(position, index));
}

function setPositionSelected(position: DataPosition, index: number, selected: boolean): void {
  const next = new Set(selectedPositionKeys.value);
  const key = positionSelectionKey(position, index);
  if (selected) {
    next.add(key);
  } else {
    next.delete(key);
  }
  selectedPositionKeys.value = next;
}

function setAllVisiblePositionsSelected(selected: boolean): void {
  const next = new Set(selectedPositionKeys.value);
  for (const key of visiblePositionKeys.value) {
    if (selected) {
      next.add(key);
    } else {
      next.delete(key);
    }
  }
  selectedPositionKeys.value = next;
}

function isPositionActionDisabled(key: string): boolean {
  if (key === 'split') return splitSubmitting.value || !selectedAccount.value || !props.conditionId;
  if (key === 'merge') {
    return (
      mergeSubmitting.value ||
      !selectedAccount.value ||
      !props.conditionId ||
      selectedVisiblePositionCount.value !== 2 ||
      mergeAmountMax.value <= 0
    );
  }
  if (key === 'quickSell') return selectedVisiblePositionCount.value === 0;
  return false;
}

function accountDisplayName(account: PolymarketWalletSummary): string {
  return account.name || account.id;
}

function accountBalanceLabel(account: PolymarketWalletSummary): string {
  if (!account.credentialsConfigured) return '—';
  if (!account.balance) return '';
  return account.balance.balanceUsd
    ? formatUsd(account.balance.balanceUsd)
    : account.balance.balance;
}

function positionSize(position: DataPosition): number {
  const size = Number(position.size);
  return Number.isFinite(size) && size > 0 ? size : 0;
}

function openActionPopover(action: 'split' | 'merge'): void {
  clearActionErrors();
  actionPopover.value = action;
  void nextTick(updateActionPopoverPosition);
}

function closeActionPopover(): void {
  actionPopover.value = null;
}

function confirmActionPopover(): void {
  const action = actionPopover.value;
  if (action === 'split') {
    actionPopover.value = null;
    void submitSplitPosition();
    return;
  }
  if (action === 'merge') {
    actionPopover.value = null;
    void submitMergePositions();
  }
}

function handlePositionActionClick(key: string): void {
  if (isPositionActionDisabled(key)) return;
  if (key === 'split') {
    openActionPopover('split');
    return;
  }
  if (key === 'merge') {
    openActionPopover('merge');
    return;
  }
  closeActionPopover();
}

async function submitSplitPosition(): Promise<void> {
  clearSplitError();
  const amountError = validateSplitAmount();
  if (amountError) {
    setSplitValidationError(amountError);
    return;
  }

  splitSubmitting.value = true;
  try {
    const walletId = selectedAccount.value?.id ?? '';
    const result = await window.api.tradingAccount.splitPosition({
      walletId,
      conditionId: props.conditionId,
      amount: splitAmount.value,
      negRisk: props.marketNegRisk,
    });
    if (!result.ok) {
      setSplitError(result.error);
      return;
    }
    splitAmount.value = '';
  } catch (error) {
    setSplitError(error instanceof Error ? error.message : String(error));
  } finally {
    splitSubmitting.value = false;
  }
}

function validateSplitAmount(): string {
  const amount = amountBaseUnits(splitAmount.value);
  if (amount == null || amount <= 0n) return t('position.splitAmountGreaterThanZero');

  const balance = selectedAccountBalanceBaseUnits.value;
  if (balance == null) return t('position.splitBalanceUnavailable');

  if (amount > balance) {
    return t('position.splitAmountExceedsBalance', {
      amount: splitAmountMaxLabel.value,
    });
  }

  return '';
}

async function submitMergePositions(): Promise<void> {
  clearMergeError();
  const amountError = validateMergeAmount();
  if (amountError) {
    setMergeValidationError(amountError);
    return;
  }

  mergeSubmitting.value = true;
  try {
    const walletId = selectedAccount.value?.id ?? '';
    const result = await window.api.tradingAccount.mergePositions({
      walletId,
      conditionId: props.conditionId,
      amount: mergeAmount.value,
      negRisk: props.marketNegRisk,
    });
    if (!result.ok) {
      setMergeError(result.error);
      return;
    }
    mergeAmount.value = '';
  } catch (error) {
    setMergeError(error instanceof Error ? error.message : String(error));
  } finally {
    mergeSubmitting.value = false;
  }
}

function validateMergeAmount(): string {
  const amount = Number(mergeAmount.value);
  if (!Number.isFinite(amount) || amount <= 0) return t('position.mergeAmountGreaterThanZero');
  if (amount > mergeAmountMax.value) {
    return t('position.mergeAmountExceedsAvailable', {
      amount: formatNumber(mergeAmountMax.value, 2),
    });
  }
  return '';
}

function accountBalanceBaseUnits(account: PolymarketWalletSummary | null): bigint | null {
  const rawBalance = account?.balance?.balance;
  if (rawBalance == null) return null;

  const text = String(rawBalance).trim();
  if (!/^\d+$/.test(text)) return null;

  return BigInt(text);
}

function amountBaseUnits(value: string): bigint | null {
  const text = value.trim();
  if (!AMOUNT_PATTERN.test(text)) return null;

  const [integerPart, decimalPart = ''] = text.split('.');
  const raw = `${integerPart}${decimalPart.padEnd(COLLATERAL_DECIMALS, '0')}`;
  return BigInt(raw.replace(/^0+/, '') || '0');
}

function baseUnitsToNumber(value: bigint): number {
  return Number(value) / Number(COLLATERAL_SCALE);
}

function clearActionErrors(): void {
  clearSplitError();
  clearMergeError();
}

function clearSplitError(): void {
  splitError.value = '';
  splitErrorDetail.value = '';
}

function clearMergeError(): void {
  mergeError.value = '';
  mergeErrorDetail.value = '';
}

function setSplitError(detail: string): void {
  clearMergeError();
  splitError.value = t('position.splitFailed');
  splitErrorDetail.value = detail;
}

function setSplitValidationError(detail: string): void {
  clearMergeError();
  splitError.value = detail;
  splitErrorDetail.value = detail;
}

function setMergeError(detail: string): void {
  clearSplitError();
  mergeError.value = t('position.mergeFailed');
  mergeErrorDetail.value = detail;
}

function setMergeValidationError(detail: string): void {
  clearSplitError();
  mergeError.value = detail;
  mergeErrorDetail.value = detail;
}

function actionError(): string {
  return splitError.value || mergeError.value;
}

function actionErrorDetail(): string {
  return splitError.value ? splitErrorDetail.value : mergeErrorDetail.value;
}

function setPositionActionButtonRef(key: string, el: Element | null): void {
  const current = actionButtonEls.value.get(key) ?? null;
  if (current === el) return;
  if (el == null && current == null) return;

  const next = new Map(actionButtonEls.value);
  if (el instanceof HTMLElement) next.set(key, el);
  else next.delete(key);
  actionButtonEls.value = next;
}

function updateActionPopoverPosition(): void {
  const action = actionPopover.value;
  if (!action) return;
  const buttonEl = actionButtonEls.value.get(action);
  if (!buttonEl) return;
  const rect = buttonEl.getBoundingClientRect();
  actionPopoverPosition.value = {
    left: rect.left + rect.width / 2,
    top: rect.top - 8,
  };
}

function handleDocumentPointerDown(event: PointerEvent): void {
  const action = actionPopover.value;
  if (!action) return;
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (action === 'split' && splitPopoverEl.value?.contains(target)) return;
  if (action === 'merge' && mergePopoverEl.value?.contains(target)) return;
  if (actionButtonEls.value.get(action)?.contains(target)) return;
  closeActionPopover();
}

watch(visiblePositionKeys, (keys) => {
  const visibleKeys = new Set(keys);
  selectedPositionKeys.value = new Set(
    [...selectedPositionKeys.value].filter((key) => visibleKeys.has(key)),
  );
});

onMounted(() => {
  window.addEventListener('resize', updateActionPopoverPosition);
  window.addEventListener('scroll', updateActionPopoverPosition, true);
  document.addEventListener('pointerdown', handleDocumentPointerDown, true);
});

onUnmounted(() => {
  window.removeEventListener('resize', updateActionPopoverPosition);
  window.removeEventListener('scroll', updateActionPopoverPosition, true);
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
});
</script>

<template>
  <section
    class="overflow-hidden"
    :class="
      embedded
        ? 'flex min-h-0 flex-1 flex-col'
        : 'border-border bg-detail-bg max-h-[220px] shrink-0 rounded-lg border'
    "
  >
    <div
      v-if="!embedded"
      class="border-border flex items-center justify-between border-b px-4 py-3"
    >
      <h2 class="text-sm font-semibold text-white">{{ t('tradingWindow.positionsTab') }}</h2>
      <LoadingSpinner v-if="loading" :title="t('position.loadPositions')" />
      <span v-else class="text-muted text-xs">{{
        t('count.items', { count: positions.length })
      }}</span>
    </div>

    <div v-if="error" class="px-4 py-3 text-xs text-red-400">
      {{ error }}
    </div>

    <div class="overflow-auto" :class="embedded ? 'min-h-0 flex-1' : 'max-h-[170px]'">
      <table class="w-full border-collapse text-sm">
        <thead class="bg-surface sticky top-0">
          <tr>
            <th class="text-muted w-10 px-3 py-2 text-left align-middle text-xs font-medium">
              <input
                type="checkbox"
                class="accent-primary block h-3.5 w-3.5"
                :checked="allVisiblePositionsSelected"
                :indeterminate="someVisiblePositionsSelected"
                :disabled="positions.length === 0 || loading"
                :title="t('position.selectAll')"
                :aria-label="t('position.selectAll')"
                @change="
                  setAllVisiblePositionsSelected(($event.target as HTMLInputElement).checked)
                "
              />
            </th>
            <th class="text-muted px-3 py-2 text-left text-xs font-medium">Outcome</th>
            <th class="text-muted px-3 py-2 text-right text-xs font-medium">
              {{ t('position.size') }}
            </th>
            <th class="text-muted px-3 py-2 text-right text-xs font-medium">
              {{ t('position.averagePrice') }}
            </th>
            <th class="text-muted px-3 py-2 text-right text-xs font-medium">
              {{ t('position.currentPrice') }}
            </th>
            <th class="text-muted px-3 py-2 text-right text-xs font-medium">
              {{ t('position.pnl') }}
            </th>
            <th class="text-muted px-3 py-2 text-right text-xs font-medium">
              {{ t('position.value') }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="7" class="px-3 py-6 text-center">
              <LoadingSpinner :title="t('position.loadPositions')" />
            </td>
          </tr>
          <tr
            v-for="(position, index) in positions"
            :key="`${position.conditionId}-${position.outcomeIndex}-${index}`"
            class="border-border/50 border-b"
          >
            <td class="px-3 py-2 align-middle">
              <input
                type="checkbox"
                class="accent-primary block h-3.5 w-3.5"
                :checked="isPositionSelected(position, index)"
                :title="t('position.selectPosition')"
                :aria-label="t('position.selectPosition')"
                @change="
                  setPositionSelected(position, index, ($event.target as HTMLInputElement).checked)
                "
              />
            </td>
            <td class="text-text px-3 py-2">{{ position.outcome || '—' }}</td>
            <td class="text-text px-3 py-2 text-right tabular-nums">
              {{ formatNumber(position.size, 2) }}
            </td>
            <td class="text-text px-3 py-2 text-right tabular-nums">
              {{ formatPrice(position.avgPrice) }}
            </td>
            <td class="text-text px-3 py-2 text-right tabular-nums">
              {{ formatPrice(position.curPrice) }}
            </td>
            <td
              class="px-3 py-2 text-right tabular-nums"
              :class="Number(position.cashPnl) >= 0 ? 'text-green-400' : 'text-red-400'"
            >
              {{ formatPnl(position.cashPnl) }}
              <span class="text-muted ml-1">{{ formatPercent(position.percentPnl) }}</span>
            </td>
            <td class="text-text px-3 py-2 text-right tabular-nums">
              {{ formatUsd(position.currentValue) }}
            </td>
          </tr>
          <tr v-if="positions.length === 0 && !loading">
            <td colspan="7" class="text-muted px-3 py-6 text-center text-xs">
              {{ t('position.noPositions') }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="border-border/70 border-t px-3 py-2">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <div v-for="action in leftPositionActions" :key="action.key" class="relative">
            <button
              :ref="(el) => setPositionActionButtonRef(action.key, el as Element | null)"
              type="button"
              class="border-border bg-surface hover:bg-surface-light focus:ring-primary/50 disabled:hover:bg-surface flex h-8 items-center justify-center gap-1.5 rounded-md border px-3 text-xs font-medium whitespace-nowrap text-white transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-45"
              :disabled="isPositionActionDisabled(action.key)"
              :title="t(action.titleKey)"
              :aria-label="t(action.titleKey)"
              @click="handlePositionActionClick(action.key)"
            >
              <LoadingSpinner
                v-if="
                  (action.key === 'split' && splitSubmitting) ||
                  (action.key === 'merge' && mergeSubmitting)
                "
                :size="14"
                :title="t(action.titleKey)"
              />
              <component :is="action.icon" v-else :size="14" />
              <span>{{ t(action.labelKey) }}</span>
            </button>
          </div>
        </div>

        <p
          v-if="actionError()"
          class="min-w-0 flex-1 truncate px-3 text-center text-xs text-red-400"
          :title="actionErrorDetail()"
        >
          {{ actionError() }}
        </p>
        <div v-else class="min-w-0 flex-1" />

        <div class="flex items-center gap-2">
          <button
            v-for="action in rightPositionActions"
            :key="action.key"
            type="button"
            class="border-border bg-surface hover:bg-surface-light focus:ring-primary/50 disabled:hover:bg-surface flex h-8 items-center justify-center gap-1.5 rounded-md border px-3 text-xs font-medium whitespace-nowrap text-white transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-45"
            :disabled="isPositionActionDisabled(action.key)"
            :title="t(action.titleKey)"
            :aria-label="t(action.titleKey)"
            @click="handlePositionActionClick(action.key)"
          >
            <component :is="action.icon" :size="14" />
            <span>{{ t(action.labelKey) }}</span>
          </button>
        </div>
      </div>
    </div>
  </section>

  <Teleport to="body">
    <SplitPositionPopover
      v-if="actionPopover === 'split'"
      ref="splitPopoverEl"
      v-model:amount="splitAmount"
      :wallet-name="selectedAccountName"
      :account-balance="selectedAccountBalanceLabel"
      :max-amount="splitAmountMax"
      :error="splitAmountVisibleError"
      :confirm-disabled="splitConfirmDisabled"
      :style="actionPopoverStyle"
      @cancel="closeActionPopover"
      @confirm="confirmActionPopover"
    />
    <MergePositionsPopover
      v-if="actionPopover === 'merge'"
      ref="mergePopoverEl"
      v-model:amount="mergeAmount"
      :positions="selectedVisiblePositions"
      :max-amount="mergeAmountMax"
      :error="mergeAmountVisibleError"
      :confirm-disabled="mergeConfirmDisabled"
      :style="actionPopoverStyle"
      @cancel="closeActionPopover"
      @confirm="confirmActionPopover"
    />
  </Teleport>
</template>
