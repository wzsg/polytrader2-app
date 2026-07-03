<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { Check, ChevronDown } from '@lucide/vue';
import type { PolymarketWalletSummary } from '@polytrader/shared';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';
import { formatUsd } from '@/shared/utils/format';
import { useI18n } from 'vue-i18n';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    accounts: PolymarketWalletSummary[];
    disabled?: boolean;
    loading?: boolean;
    tradableOnly?: boolean;
  }>(),
  {
    disabled: false,
    loading: false,
    tradableOnly: true,
  },
);

const emit = defineEmits<{
  'update:modelValue': [walletId: string];
}>();

const { t } = useI18n();

const rootEl = ref<HTMLElement | null>(null);
const buttonEl = ref<HTMLButtonElement | null>(null);
const open = ref(false);

const visibleAccounts = computed(() =>
  props.tradableOnly
    ? props.accounts.filter((account) => account.credentialsConfigured)
    : props.accounts,
);

const selectedAccount = computed(
  () => visibleAccounts.value.find((account) => account.id === props.modelValue) ?? null,
);

const disabled = computed(
  () => props.disabled || props.loading || visibleAccounts.value.length === 0,
);

function accountDisplayName(account: PolymarketWalletSummary): string {
  return account.name || account.id;
}

function accountBalanceLabel(account: PolymarketWalletSummary): string {
  if (!account.balance) return '';
  return account.balance.balanceUsd
    ? formatUsd(account.balance.balanceUsd)
    : account.balance.balance;
}

function accountOptionDisabled(account: PolymarketWalletSummary): boolean {
  return !account.credentialsConfigured;
}

function toggleOpen(): void {
  if (disabled.value) return;
  open.value = !open.value;
}

function closeMenu(): void {
  open.value = false;
}

function selectAccount(account: PolymarketWalletSummary): void {
  if (accountOptionDisabled(account)) return;
  emit('update:modelValue', account.id);
  closeMenu();
  buttonEl.value?.focus();
}

function handleDocumentPointerDown(event: PointerEvent): void {
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (rootEl.value?.contains(target)) return;
  closeMenu();
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  closeMenu();
  buttonEl.value?.focus();
}

watch(
  () => disabled.value,
  (nextDisabled) => {
    if (nextDisabled) closeMenu();
  },
);

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown, true);
  document.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
  document.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div ref="rootEl" class="relative block">
    <span class="text-muted text-xs">{{ t('common.account') }}</span>
    <button
      ref="buttonEl"
      type="button"
      class="border-border bg-surface text-text focus:border-primary mt-1 flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-60"
      :disabled="disabled"
      :aria-expanded="open"
      aria-haspopup="listbox"
      :title="t('common.account')"
      @click="toggleOpen"
    >
      <span class="flex min-w-0 flex-1 items-center justify-between gap-2">
        <span class="min-w-0 truncate text-left">
          {{
            selectedAccount
              ? accountDisplayName(selectedAccount)
              : t('tradingWindow.noTradableAccounts')
          }}
        </span>
        <span class="text-primary-light shrink-0 tabular-nums">
          <LoadingSpinner v-if="loading" :size="14" :title="t('common.account')" />
          <template v-else-if="selectedAccount">
            {{ accountBalanceLabel(selectedAccount) }}
          </template>
        </span>
      </span>
      <ChevronDown :size="15" class="text-muted-light shrink-0" />
    </button>

    <div
      v-if="open"
      class="border-border bg-detail-bg absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-md border py-1 shadow-xl"
      role="listbox"
    >
      <button
        v-for="account in visibleAccounts"
        :key="account.id"
        type="button"
        class="hover:bg-btn-secondary focus:bg-btn-secondary flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-45"
        :class="account.id === modelValue ? 'bg-btn-secondary-hover' : 'bg-transparent'"
        :disabled="accountOptionDisabled(account)"
        :aria-selected="account.id === modelValue"
        role="option"
        @click="selectAccount(account)"
      >
        <span class="min-w-0 truncate text-white">{{ accountDisplayName(account) }}</span>
        <span class="flex shrink-0 items-center gap-2">
          <span class="text-primary-light tabular-nums">{{ accountBalanceLabel(account) }}</span>
          <Check v-if="account.id === modelValue" :size="14" class="text-primary-light" />
        </span>
      </button>
    </div>
  </div>
</template>
