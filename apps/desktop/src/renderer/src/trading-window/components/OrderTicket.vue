<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';
import { currentOrderConfirmationThresholdUsd } from '@/shared/i18n';
import { useI18n } from 'vue-i18n';
import { formatNumber, formatPriceByTick } from '@/shared/utils/format';
import WalletSelect from './WalletSelect.vue';
import PriceCentsInput from './PriceCentsInput.vue';
import PusdAmountInput from './PusdAmountInput.vue';
import SharesInput from './SharesInput.vue';
import SubmitOrderButton from './SubmitOrderButton.vue';
import type {
  ApiResult,
  DataPosition,
  MarketOutcome,
  ManualPlaceOrderInput,
  OrderBook,
  StrategyOrderSide,
  PolymarketWalletSummary,
} from '@polytrader/shared';
import { isPriceAlignedToTick, normalizePriceTickSize } from '@polytrader/shared';

const props = defineProps<{
  outcomes: MarketOutcome[];
  selectedTokenId?: string | null;
  orderBooks: OrderBook[];
  positions: DataPosition[];
  accounts: PolymarketWalletSummary[];
  configured: boolean;
  walletId?: string;
  accountsLoading?: boolean;
  positionsLoading?: boolean;
}>();

const emit = defineEmits<{
  submitted: [];
  'update:walletId': [walletId: string];
  accountChange: [walletId: string];
}>();

const { t } = useI18n();

const fallbackAccountId = ref('');
const tokenId = ref('');
const side = ref<StrategyOrderSide>('BUY');
const orderType = ref<'limit' | 'market'>('limit');
const price = ref('');
const shares = ref('');
const amount = ref('');
const postOnly = ref(false);
const submitting = ref(false);
const error = ref('');

const currentAccountId = computed(() => props.walletId ?? fallbackAccountId.value);
const currentAccountIdModel = computed({
  get: () => currentAccountId.value,
  set: (walletId: string) => updateAccountId(walletId),
});
const tradableAccounts = computed(() =>
  props.accounts.filter((item) => item.credentialsConfigured),
);
const selectedAccount = computed(() =>
  props.accounts.find((account) => account.id === currentAccountId.value),
);
const selectedOrderBook = computed(
  () => props.orderBooks.find((book) => book.tokenId === tokenId.value) ?? null,
);
const bestOrderPrice = computed(() => {
  const level =
    side.value === 'BUY' ? selectedOrderBook.value?.bids?.[0] : selectedOrderBook.value?.asks?.[0];
  return level?.price ?? '';
});
const bestMarketExecutionPrice = computed(() => {
  const level =
    side.value === 'BUY' ? selectedOrderBook.value?.asks?.[0] : selectedOrderBook.value?.bids?.[0];
  return Number(level?.price) || 0;
});
const bestOrderPriceLabel = computed(() =>
  bestOrderPrice.value
    ? formatPriceByTick(bestOrderPrice.value, selectedOrderBook.value?.tickSize)
    : '',
);
const selectedOutcome = computed(
  () => props.outcomes.find((outcome) => outcome.tokenId === tokenId.value) ?? null,
);
const heldShares = computed(() =>
  props.positions.reduce((total, position) => {
    const assetMatched = String(position.asset || '') === String(tokenId.value || '');
    const outcomeMatched =
      !position.asset &&
      selectedOutcome.value?.label &&
      String(position.outcome || '') === String(selectedOutcome.value.label);
    if (!assetMatched && !outcomeMatched) return total;
    const size = Number(position.size);
    return Number.isFinite(size) ? total + size : total;
  }, 0),
);
const heldSharesLabel = computed(() => formatNumber(heldShares.value, 2));
const heldSharesInputValue = computed(() => Number(heldShares.value.toFixed(8)).toString());
const priceTextClass = computed(() => (side.value === 'BUY' ? 'text-green-400' : 'text-red-400'));
const canSubmit = computed(() => {
  return Boolean(currentAccountId.value && selectedAccount.value?.credentialsConfigured === true);
});

const isMarketSell = computed(() => orderType.value === 'market' && side.value === 'SELL');
const isLimitBuy = computed(() => orderType.value === 'limit' && side.value === 'BUY');
const estimateLabel = computed(() =>
  isMarketSell.value ? t('tradingWindow.estimatedProceeds') : t('tradingWindow.estimatedCost'),
);
const estimate = computed(() => {
  if (orderType.value === 'market') {
    if (side.value === 'SELL') {
      return (Number(shares.value) || 0) * bestMarketExecutionPrice.value;
    }
    return Number(amount.value) || 0;
  }
  return (Number(price.value) || 0) * (Number(shares.value) || 0);
});
const estimateValueLabel = computed(() => `$${estimate.value.toFixed(2)}`);
const antiMistouchEnabled = computed(() => {
  return (
    Number.isFinite(estimate.value) && estimate.value > currentOrderConfirmationThresholdUsd.value
  );
});
const estimatedProfit = computed(() => (Number(shares.value) || 0) * 1);
const estimatedProfitLabel = computed(() => `$${estimatedProfit.value.toFixed(2)}`);
const limitBuyMinimumShares = computed(() => {
  if (orderType.value !== 'limit' || side.value !== 'BUY') return null;
  const value = Number(selectedOrderBook.value?.minOrderSize);
  return Number.isFinite(value) && value > 0 ? value : null;
});
const orderValidationError = computed(() => {
  if (orderType.value === 'limit' && price.value) {
    const tickSize = normalizePriceTickSize(selectedOrderBook.value?.tickSize);
    if (tickSize != null && !isPriceAlignedToTick(price.value, tickSize)) {
      return t('tradingWindow.limitPriceTickSize', { tickSize });
    }
  }
  const minimumShares = limitBuyMinimumShares.value;
  if (minimumShares == null) return '';
  const currentShares = Number(shares.value);
  if (!Number.isFinite(currentShares) || currentShares <= 0) return '';
  if (currentShares >= minimumShares) return '';
  return t('tradingWindow.limitBuyMinShares', {
    minShares: formatNumber(minimumShares, 2),
  });
});
const submitError = computed(() => orderValidationError.value || error.value);
const canPlaceOrder = computed(() => canSubmit.value && !orderValidationError.value);

watch(
  () => props.selectedTokenId,
  (next) => {
    if (next) tokenId.value = next;
  },
  { immediate: true },
);

watch(
  () => props.outcomes,
  (next) => {
    if (!tokenId.value && next[0]) tokenId.value = next[0].tokenId;
  },
  { immediate: true },
);

watch(
  () => props.accounts,
  () => {
    const defaultAccount =
      tradableAccounts.value.find((item) => item.isDefault) ?? tradableAccounts.value[0];
    if (!currentAccountId.value && defaultAccount) updateAccountId(defaultAccount.id, false);
    if (
      currentAccountId.value &&
      !tradableAccounts.value.some((item) => item.id === currentAccountId.value)
    ) {
      updateAccountId(defaultAccount?.id || '', false);
    }
  },
  { immediate: true },
);

function updateAccountId(nextAccountId: string, notify = true): void {
  if (props.walletId !== undefined) emit('update:walletId', nextAccountId);
  else fallbackAccountId.value = nextAccountId;
  if (notify) emit('accountChange', nextAccountId);
}

function applyBestOrderPrice(): void {
  if (!bestOrderPrice.value) return;
  price.value = bestOrderPrice.value;
}

function applyHeldShares(): void {
  if (props.positionsLoading || heldShares.value <= 0) return;
  shares.value = heldSharesInputValue.value;
}

function createOrderId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function buildInput(orderId: string): ManualPlaceOrderInput {
  const tickSize = Number(selectedOrderBook.value?.tickSize);
  const normalizedTickSize = Number.isFinite(tickSize) && tickSize > 0 ? tickSize : undefined;
  if (orderType.value === 'limit') {
    return {
      walletId: currentAccountId.value,
      orderId,
      order: {
        assetId: tokenId.value,
        side: side.value,
        orderType: 'limit',
        price: Number(price.value),
        shares: Number(shares.value),
        tickSize: normalizedTickSize,
        postOnly: postOnly.value,
      },
    };
  }

  return {
    walletId: currentAccountId.value,
    orderId,
    order: {
      assetId: tokenId.value,
      side: side.value,
      orderType: 'market',
      amount: side.value === 'SELL' ? Number(shares.value) : Number(amount.value),
      tickSize: normalizedTickSize,
      marketOrderType: 'FOK',
    },
  };
}

async function submitOrder(): Promise<void> {
  if (!canSubmit.value || submitting.value) return;
  error.value = '';
  if (orderValidationError.value) return;
  submitting.value = true;

  try {
    const result = (await window.api.tradingAccount.placeOrder(
      buildInput(createOrderId()),
    )) as ApiResult<unknown>;
    if (!result.ok) {
      error.value = result.error;
      return;
    }
    emit('submitted');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <section class="flex min-h-0 flex-col">
    <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
      <WalletSelect
        v-model="currentAccountIdModel"
        :accounts="accounts"
        :disabled="accountsLoading || tradableAccounts.length === 0"
        :loading="accountsLoading"
      />

      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="item in outcomes"
          :key="item.tokenId"
          type="button"
          class="border-border rounded-md border px-3 py-2 text-sm transition-colors"
          :class="
            tokenId === item.tokenId
              ? 'bg-primary/20 text-primary-light'
              : 'bg-surface text-text hover:bg-btn-secondary'
          "
          @click="tokenId = item.tokenId"
        >
          {{ item.label }}
        </button>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <button
          type="button"
          class="rounded-md px-3 py-2 text-sm font-medium transition-colors"
          :class="side === 'BUY' ? 'bg-green-500/20 text-green-300' : 'bg-surface text-muted-light'"
          @click="side = 'BUY'"
        >
          {{ t('trade.buy') }}
        </button>
        <button
          type="button"
          class="rounded-md px-3 py-2 text-sm font-medium transition-colors"
          :class="side === 'SELL' ? 'bg-red-500/20 text-red-300' : 'bg-surface text-muted-light'"
          @click="side = 'SELL'"
        >
          {{ t('trade.sell') }}
        </button>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <button
          type="button"
          class="border-border rounded-md border px-3 py-2 text-sm"
          :class="
            orderType === 'limit' ? 'bg-primary/20 text-primary-light' : 'bg-surface text-text'
          "
          @click="orderType = 'limit'"
        >
          {{ t('order.limit') }}
        </button>
        <button
          type="button"
          class="border-border rounded-md border px-3 py-2 text-sm"
          :class="
            orderType === 'market' ? 'bg-primary/20 text-primary-light' : 'bg-surface text-text'
          "
          @click="orderType = 'market'"
        >
          {{ t('order.market') }}
        </button>
      </div>

      <template v-if="orderType === 'limit'">
        <div class="block">
          <span class="text-muted text-xs">{{ t('common.price') }}</span>
          <span
            v-if="bestOrderPriceLabel"
            class="float-right cursor-pointer text-xs font-semibold tabular-nums"
            :class="priceTextClass"
            role="button"
            tabindex="0"
            @click.prevent="applyBestOrderPrice"
            @keydown.enter.prevent="applyBestOrderPrice"
            @keydown.space.prevent="applyBestOrderPrice"
          >
            {{ bestOrderPriceLabel }}
          </span>
          <PriceCentsInput v-model="price" :tick-size="selectedOrderBook?.tickSize" />
        </div>
        <div class="block">
          <span class="text-muted text-xs">{{ t('tradingWindow.orderShares') }}</span>
          <span
            class="text-muted-light float-right text-xs font-semibold tabular-nums"
            :class="!positionsLoading && heldShares > 0 ? 'cursor-pointer hover:text-white' : ''"
            :role="!positionsLoading && heldShares > 0 ? 'button' : undefined"
            :tabindex="!positionsLoading && heldShares > 0 ? 0 : -1"
            @click.prevent="applyHeldShares"
            @keydown.enter.prevent="applyHeldShares"
            @keydown.space.prevent="applyHeldShares"
          >
            <LoadingSpinner
              v-if="positionsLoading"
              :size="11"
              :title="t('tradingWindow.loadHeldShares')"
            />
            <template v-else>{{
              t('tradingWindow.heldShares', { value: heldSharesLabel })
            }}</template>
          </span>
          <SharesInput v-model="shares" />
        </div>
        <label class="text-muted-light flex items-center gap-2 text-sm">
          <input v-model="postOnly" type="checkbox" class="h-4 w-4" />
          Post-only
        </label>
      </template>

      <label v-else-if="side === 'BUY'" class="block">
        <span class="text-muted text-xs">{{ t('common.amountPusd') }}</span>
        <PusdAmountInput v-model="amount" />
      </label>
      <div v-else class="block">
        <span class="text-muted text-xs">{{ t('tradingWindow.sharesToSell') }}</span>
        <span
          class="text-muted-light float-right text-xs font-semibold tabular-nums"
          :class="!positionsLoading && heldShares > 0 ? 'cursor-pointer hover:text-white' : ''"
          :role="!positionsLoading && heldShares > 0 ? 'button' : undefined"
          :tabindex="!positionsLoading && heldShares > 0 ? 0 : -1"
          @click.prevent="applyHeldShares"
          @keydown.enter.prevent="applyHeldShares"
          @keydown.space.prevent="applyHeldShares"
        >
          <LoadingSpinner
            v-if="positionsLoading"
            :size="11"
            :title="t('tradingWindow.loadHeldShares')"
          />
          <template v-else>{{
            t('tradingWindow.heldShares', { value: heldSharesLabel })
          }}</template>
        </span>
        <SharesInput v-model="shares" />
      </div>

      <div class="border-border border-y py-2">
        <p class="text-muted text-xs">{{ estimateLabel }}</p>
        <p class="text-text mt-1 text-lg font-semibold tabular-nums">{{ estimateValueLabel }}</p>
        <template v-if="isLimitBuy">
          <p class="text-muted mt-2 text-xs">{{ t('tradingWindow.estimatedProfit') }}</p>
          <p class="mt-1 text-lg font-semibold text-green-300 tabular-nums">
            {{ estimatedProfitLabel }}
          </p>
        </template>
      </div>

      <p v-if="!canSubmit" class="text-sm text-amber-400">
        {{ t('tradingWindow.credentialsRequired') }}
      </p>
      <p v-if="submitError" class="text-sm text-red-400">{{ submitError }}</p>
    </div>

    <div class="border-border border-t p-3">
      <SubmitOrderButton
        :anti-mistouch-enabled="antiMistouchEnabled"
        :disabled="!canPlaceOrder"
        :label="t('tradingWindow.submitOrder')"
        :loading="submitting"
        :slide-label="t('tradingWindow.slideToSubmit')"
        :slide-ready-label="t('tradingWindow.slideSubmitReady')"
        :title="t('tradingWindow.slideToSubmitTitle')"
        @submit="submitOrder"
      />
    </div>
  </section>
</template>
