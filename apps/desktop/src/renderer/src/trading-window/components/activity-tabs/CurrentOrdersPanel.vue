<script setup lang="ts">
import { computed, ref } from 'vue';
import ErrorMessageDialog from '@/shared/components/ErrorMessageDialog.vue';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';
import { useI18n } from 'vue-i18n';
import { formatTimestamp } from '@/shared/utils/format';
import type { AccountOrderStatus, ClobOrder } from '@polytrader/shared';
import { Trash2, XCircle } from '@lucide/vue';

const props = withDefaults(
  defineProps<{
    orders: ClobOrder[];
    cancelingOrderIds?: string[];
    strategyOrderIds?: string[];
    embedded?: boolean;
  }>(),
  {
    cancelingOrderIds: () => [],
    strategyOrderIds: () => [],
    embedded: false,
  },
);

const emit = defineEmits<{
  cancel: [orderId: string, walletId: string];
  cancelAll: [orderIds: string[], walletId: string];
  deleteFailed: [orderId: string, walletId: string];
}>();

const { t } = useI18n();

const cancelableStatuses = new Set<AccountOrderStatus>([
  'pending',
  'submitted',
  'live',
  'delayed',
  'unmatched',
]);
const strategyOrderIdSet = computed(() => new Set(props.strategyOrderIds.map(String)));
const cancelingOrderIdSet = computed(() => new Set(props.cancelingOrderIds.map(String)));
const errorDialogMessage = ref('');
const cancelableOrders = computed(() => props.orders.filter((order) => canBulkCancelOrder(order)));
const cancelableAccountId = computed(() => {
  const accounts = new Set(cancelableOrders.value.map(orderAccountId).filter(Boolean));
  return accounts.size === 1 ? [...accounts][0] : '';
});
const cancelAllDisabled = computed(
  () =>
    cancelingOrderIdSet.value.size > 0 ||
    !cancelableOrders.value.length ||
    !cancelableAccountId.value,
);

function orderId(order: ClobOrder): string {
  return String(order.id || '');
}

function exchangeOrderId(order: ClobOrder): string {
  const explicitId = String(order.exchange_order_id || '').trim();
  if (explicitId) return explicitId;

  const id = String(order.id || '').trim();
  const localOrderId = String(order.order_id || '').trim();
  return id && id !== localOrderId ? id : '';
}

function orderAccountId(order: ClobOrder): string {
  return String(order.wallet_id || '').trim();
}

function requestOrderAction(order: ClobOrder): void {
  const id = orderId(order);
  const walletId = orderAccountId(order);
  if (!id) {
    errorDialogMessage.value = t('tradingWindow.missingOrderId');
    return;
  }
  if (!walletId) {
    errorDialogMessage.value = t('tradingWindow.missingOrderAccountId');
    return;
  }
  if (canDeleteOrder(order)) {
    emit('deleteFailed', id, walletId);
    return;
  }
  emit('cancel', id, walletId);
}

function requestCancelAll(): void {
  if (cancelAllDisabled.value) return;
  const walletId = cancelableAccountId.value;
  if (!walletId) {
    errorDialogMessage.value = t('tradingWindow.missingOrderAccountId');
    return;
  }
  const orderIds = [...new Set(cancelableOrders.value.map(exchangeOrderId).filter(Boolean))];
  if (!orderIds.length) {
    errorDialogMessage.value = t('tradingWindow.missingOrderId');
    return;
  }
  emit('cancelAll', orderIds, walletId);
}

function isStrategyOrder(order: ClobOrder): boolean {
  const id = orderId(order);
  return Boolean(id && strategyOrderIdSet.value.has(id));
}

function orderStatus(order: ClobOrder): AccountOrderStatus | '' {
  return order.status ?? '';
}

function orderStatusLabel(order: ClobOrder): string {
  const status = orderStatus(order);
  if (!status) return '—';
  const labels: Partial<Record<AccountOrderStatus, string>> = {
    pending: t('order.pending'),
    submitting: t('order.submitting'),
    submitted: t('order.submitted'),
    live: t('order.live'),
    matched: t('order.matched'),
    delayed: t('order.delayed'),
    unmatched: t('order.unmatched'),
    'submit-failed': t('order.submitFailed'),
    failed: t('order.failed'),
    rejected: t('order.rejected'),
    canceled: t('order.canceled'),
  };
  return labels[status] ?? status;
}

function canDeleteOrder(order: ClobOrder): boolean {
  return orderStatus(order) === 'submit-failed';
}

function canBulkCancelOrder(order: ClobOrder): boolean {
  return Boolean(
    exchangeOrderId(order) &&
    orderAccountId(order) &&
    cancelableStatuses.has(orderStatus(order) as AccountOrderStatus),
  );
}

function isSubmittingOrder(order: ClobOrder): boolean {
  return orderStatus(order) === 'submitting';
}

function orderActionLabel(order: ClobOrder): string {
  return canDeleteOrder(order) ? t('order.deleteShort') : t('order.cancelShort');
}

function isCancelingOrder(order: ClobOrder): boolean {
  return (
    !canDeleteOrder(order) &&
    Boolean(
      cancelingOrderIdSet.value.has(orderId(order)) ||
      cancelingOrderIdSet.value.has(exchangeOrderId(order)),
    )
  );
}

function isCancelingAllOrders(): boolean {
  return cancelableOrders.value.some((order) =>
    cancelingOrderIdSet.value.has(exchangeOrderId(order)),
  );
}

function orderErrorMessage(order: ClobOrder): string {
  return String(order.error_message || '').trim();
}

function canShowOrderError(order: ClobOrder): boolean {
  return orderStatus(order) === 'submit-failed' && Boolean(orderErrorMessage(order));
}

function openOrderErrorDialog(order: ClobOrder): void {
  const message = orderErrorMessage(order);
  if (!message) return;
  errorDialogMessage.value = message;
}

function closeOrderErrorDialog(): void {
  errorDialogMessage.value = '';
}

function orderStatusClass(order: ClobOrder): string {
  const status = orderStatus(order);
  if (status === 'submit-failed' || status === 'failed' || status === 'rejected') {
    return 'bg-red-500/15 text-red-300';
  }
  if (status === 'submitting' || status === 'pending' || status === 'delayed') {
    return 'bg-amber-500/15 text-amber-300';
  }
  if (status === 'submitted' || status === 'live' || status === 'unmatched') {
    return 'bg-emerald-500/15 text-emerald-300';
  }
  if (status === 'matched') return 'bg-primary/20 text-primary-light';
  if (status === 'canceled') return 'bg-bg text-muted';
  return 'bg-bg text-muted';
}
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
      <h2 class="text-sm font-semibold text-white">{{ t('tradingWindow.ordersTab') }}</h2>
      <span class="text-muted text-xs">{{ t('count.items', { count: orders.length }) }}</span>
    </div>

    <div class="overflow-auto" :class="embedded ? 'min-h-0 flex-1' : 'max-h-[170px]'">
      <table class="w-full border-collapse text-sm">
        <thead class="bg-surface sticky top-0">
          <tr>
            <th class="text-muted px-3 py-2 text-left text-xs font-medium">
              {{ t('common.status') }}
            </th>
            <th class="text-muted px-3 py-2 text-left text-xs font-medium">
              {{ t('common.source') }}
            </th>
            <th class="text-muted px-3 py-2 text-left text-xs font-medium">
              {{ t('trade.direction') }}
            </th>
            <th class="text-muted px-3 py-2 text-left text-xs font-medium">Outcome</th>
            <th class="text-muted px-3 py-2 text-right text-xs font-medium">
              {{ t('common.price') }}
            </th>
            <th class="text-muted px-3 py-2 text-right text-xs font-medium">
              {{ t('position.size') }}
            </th>
            <th class="text-muted px-3 py-2 text-left text-xs font-medium">
              {{ t('common.createdAt') }}
            </th>
            <th class="text-muted px-3 py-2 text-right text-xs font-medium"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="order in orders" :key="order.id" class="border-border/50 border-b">
            <td class="px-3 py-2">
              <div class="inline-flex items-center gap-1.5">
                <button
                  v-if="canShowOrderError(order)"
                  type="button"
                  class="inline-flex min-w-14 justify-center rounded px-1.5 py-0.5 text-[11px] leading-none transition-colors hover:bg-red-500/25"
                  :class="orderStatusClass(order)"
                  @click="openOrderErrorDialog(order)"
                >
                  {{ orderStatusLabel(order) }}
                </button>
                <span
                  v-else
                  class="inline-flex min-w-14 justify-center rounded px-1.5 py-0.5 text-[11px] leading-none"
                  :class="orderStatusClass(order)"
                >
                  {{ orderStatusLabel(order) }}
                </span>
                <LoadingSpinner
                  v-if="isSubmittingOrder(order)"
                  :size="12"
                  :title="t('tradingWindow.submitOrder')"
                />
              </div>
            </td>
            <td class="px-3 py-2">
              <span
                class="rounded px-1.5 py-0.5 text-[11px] leading-none"
                :class="
                  isStrategyOrder(order) ? 'bg-primary/20 text-primary-light' : 'bg-bg text-muted'
                "
              >
                {{
                  isStrategyOrder(order)
                    ? t('tradingWindow.strategySource')
                    : t('tradingWindow.manualSource')
                }}
              </span>
            </td>
            <td
              class="px-3 py-2"
              :class="order.side === 'SELL' ? 'text-red-400' : 'text-green-400'"
            >
              {{ order.side || '—' }}
            </td>
            <td class="text-text px-3 py-2">{{ order.outcome || '—' }}</td>
            <td class="text-text px-3 py-2 text-right tabular-nums">
              {{ order.price ?? '—' }}
            </td>
            <td class="text-text px-3 py-2 text-right tabular-nums">
              {{ order.original_size ?? '—' }}
            </td>
            <td class="text-muted px-3 py-2 text-xs whitespace-nowrap">
              {{ formatTimestamp(order.created_at) }}
            </td>
            <td class="px-3 py-2 text-right">
              <div
                v-if="isCancelingOrder(order)"
                class="inline-flex h-7 min-w-[58px] items-center justify-center"
              >
                <LoadingSpinner :size="14" :title="t('order.cancel')" />
              </div>
              <button
                v-else
                type="button"
                class="border-border inline-flex h-7 min-w-max items-center gap-1 rounded border px-2.5 text-xs whitespace-nowrap text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                :title="orderActionLabel(order)"
                @click="requestOrderAction(order)"
              >
                <Trash2 v-if="canDeleteOrder(order)" :size="13" />
                <XCircle v-else :size="13" />
                <span class="whitespace-nowrap">{{ orderActionLabel(order) }}</span>
              </button>
            </td>
          </tr>
          <tr v-if="orders.length === 0">
            <td colspan="8" class="text-muted px-3 py-6 text-center text-xs">
              {{ t('order.noOrders') }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="border-border/70 border-t px-3 py-2">
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0 flex-1" />
        <button
          type="button"
          class="border-border bg-surface hover:bg-surface-light focus:ring-primary/50 disabled:hover:bg-surface inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-3 text-xs font-medium whitespace-nowrap text-white transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-45"
          :disabled="cancelAllDisabled"
          :title="t('order.cancelAllTitle')"
          :aria-label="t('order.cancelAllTitle')"
          @click="requestCancelAll"
        >
          <LoadingSpinner v-if="isCancelingAllOrders()" :size="14" :title="t('order.cancelAll')" />
          <XCircle v-else :size="14" />
          <span>{{ t('order.cancelAll') }}</span>
        </button>
      </div>
    </div>
  </section>

  <ErrorMessageDialog
    v-if="errorDialogMessage"
    :title="t('order.submitFailed')"
    :message="errorDialogMessage"
    @close="closeOrderErrorDialog"
  />
</template>
