<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AccountOrderStatus, ClobOrder } from '@polytrader/shared';
import {
  formatNumber,
  formatPrice,
  formatTimestamp,
  sideClass,
  sideLabel,
} from '@/shared/utils/format';
import ContextMenu, { type ContextMenuItem } from '@/shared/components/ContextMenu.vue';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';
import { Trash2, X, XCircle } from '@lucide/vue';

const props = defineProps<{
  walletId: string;
  orders: ClobOrder[];
  loading: boolean;
  error: string;
  configured: boolean;
}>();

const emit = defineEmits<{
  refresh: [];
  error: [message: string];
}>();

const { t } = useI18n();

const workingOrderId = ref<string | null>(null);
const actionTarget = ref<ClobOrder | null>(null);
const actionMode = ref<'cancel' | 'delete' | null>(null);
const dialogError = ref('');
const contextMenuOpen = ref(false);
const contextMenuX = ref(0);
const contextMenuY = ref(0);
const contextTarget = ref<ClobOrder | null>(null);

const emptyText = computed(() => {
  if (!props.walletId) return t('trade.selectAccount');
  if (!props.configured) return t('trade.configureTradableAccount');
  return t('order.noOrders');
});

const activeOrders = computed(() => props.orders);

const contextMenuItems = computed<ContextMenuItem[]>(() => {
  const order = contextTarget.value;
  if (!order) return [];
  const isDelete = canDeleteOrder(order);
  return [
    {
      label: orderActionLabel(order),
      icon: isDelete ? Trash2 : XCircle,
      danger: true,
      onSelect: () => requestAction(order, isDelete ? 'delete' : 'cancel'),
    },
  ];
});

function closeCancelDialog(): void {
  if (workingOrderId.value) return;
  actionTarget.value = null;
  actionMode.value = null;
  dialogError.value = '';
}

async function confirmCancel(): Promise<void> {
  const target = actionTarget.value;
  const mode = actionMode.value;
  if (!target || !mode) return;
  const targetOrderId = orderId(target);
  if (!targetOrderId) return;
  workingOrderId.value = targetOrderId;
  dialogError.value = '';
  try {
    const res =
      mode === 'delete'
        ? await window.api.tradingAccount.deleteFailedOrder(targetOrderId, props.walletId)
        : await window.api.tradingAccount.cancelOrder(targetOrderId, props.walletId);
    if (!res.ok)
      throw new Error(res.error || t('order.actionFailed', { action: orderActionLabel(target) }));
    actionTarget.value = null;
    actionMode.value = null;
    emit('refresh');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    dialogError.value = message;
    emit('error', message);
  } finally {
    workingOrderId.value = null;
  }
}

function orderId(order: ClobOrder): string {
  return String(order.id || order.exchange_order_id || order.order_id || '');
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

function canDeleteOrder(order: ClobOrder): boolean {
  return orderStatus(order) === 'submit-failed';
}

function orderActionLabel(order: ClobOrder): string {
  return canDeleteOrder(order) ? t('order.deleteShort') : t('order.cancelShort');
}

function openContextMenu(event: MouseEvent, order: ClobOrder): void {
  contextMenuX.value = event.clientX;
  contextMenuY.value = event.clientY;
  contextTarget.value = order;
  contextMenuOpen.value = true;
}

function requestAction(target: ClobOrder, mode: 'cancel' | 'delete'): void {
  dialogError.value = '';
  actionTarget.value = target;
  actionMode.value = mode;
}

function actionTitle(): string {
  if (actionMode.value === 'delete') return t('order.deleteRecord');
  return t('order.cancel');
}

function actionDescription(): string {
  if (actionMode.value === 'delete') return t('order.deleteDescription');
  return t('order.cancelDescription');
}

function eventTitle(order: ClobOrder): string {
  return order.event_title || '—';
}

function marketTitle(order: ClobOrder): string {
  return order.market_title || order.condition_id || order.market || '—';
}

function marketIcon(order: ClobOrder): string {
  return order.event_icon || order.market_icon || '';
}

function orderMarketId(order: ClobOrder): string {
  return order.market_id || '';
}

function orderEventId(order: ClobOrder): string {
  return order.event_id || '';
}

function orderTokenId(order: ClobOrder): string | null {
  return order.token_id || order.asset_id || null;
}

function canOpenOrderMarket(order: ClobOrder): boolean {
  return Boolean(orderMarketId(order) && orderEventId(order));
}

function openOrderMarket(order: ClobOrder): void {
  const marketId = orderMarketId(order);
  const eventId = orderEventId(order);
  if (!marketId || !eventId) return;

  window.api
    .openTradingWindow({
      marketId,
      eventId,
      tokenId: orderTokenId(order),
      outcome: order.outcome || null,
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      emit('error', message);
    });
}

function hideBrokenImage(event: Event): void {
  const target = event.currentTarget;
  if (target instanceof HTMLImageElement) target.style.display = 'none';
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div v-if="loading" class="flex flex-1 items-center justify-center">
      <LoadingSpinner :size="22" :title="t('order.loadOrders')" />
    </div>
    <div
      v-else-if="error"
      class="flex flex-1 items-center justify-center px-6 text-sm text-red-400"
    >
      {{ error }}
    </div>
    <div
      v-else-if="!configured || !activeOrders.length"
      class="text-muted flex flex-1 items-center justify-center text-sm"
    >
      {{ emptyText }}
    </div>
    <div v-else class="min-h-0 flex-1 overflow-auto">
      <table class="w-full border-collapse">
        <thead class="bg-surface sticky top-0 z-10">
          <tr>
            <th
              class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
            >
              {{ t('common.market') }}
            </th>
            <th
              class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
            >
              {{ t('trade.direction') }}
            </th>
            <th
              class="border-border text-muted border-b px-4 py-2.5 text-right text-xs font-semibold uppercase"
            >
              {{ t('common.price') }}
            </th>
            <th
              class="border-border text-muted border-b px-4 py-2.5 text-right text-xs font-semibold uppercase"
            >
              {{ t('common.quantity') }}
            </th>
            <th
              class="border-border text-muted border-b px-4 py-2.5 text-right text-xs font-semibold uppercase"
            >
              {{ t('trade.matched') }}
            </th>
            <th
              class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
            >
              Outcome
            </th>
            <th
              class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
            >
              {{ t('common.status') }}
            </th>
            <th
              class="border-border text-muted border-b px-4 py-2.5 text-left text-xs font-semibold uppercase"
            >
              {{ t('common.createdAt') }}
            </th>
            <th
              class="border-border text-muted w-[1%] border-b px-4 py-2.5 text-center text-xs font-semibold whitespace-nowrap uppercase"
            >
              {{ t('common.actions') }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="order in activeOrders"
            :key="order.id"
            class="border-border/60 group border-b hover:bg-[#1a1a2e]"
            :class="canOpenOrderMarket(order) ? 'cursor-pointer' : 'cursor-default'"
            :title="canOpenOrderMarket(order) ? t('market.openTradingWindow') : undefined"
            @click="openOrderMarket(order)"
            @contextmenu.prevent.stop="openContextMenu($event, order)"
          >
            <td class="min-w-[260px] px-4 py-3">
              <div class="flex min-w-0 items-center gap-2.5">
                <img
                  v-if="marketIcon(order)"
                  :src="marketIcon(order)"
                  alt=""
                  class="h-8 w-8 shrink-0 rounded object-cover"
                  @error="hideBrokenImage"
                />
                <div class="min-w-0">
                  <div
                    class="text-text truncate text-sm"
                    :class="{ 'group-hover:text-primary-light': canOpenOrderMarket(order) }"
                    :title="eventTitle(order)"
                  >
                    {{ eventTitle(order) }}
                  </div>
                  <div
                    class="text-muted truncate text-xs"
                    :class="{ 'group-hover:text-text': canOpenOrderMarket(order) }"
                    :title="marketTitle(order)"
                  >
                    {{ marketTitle(order) }}
                  </div>
                </div>
              </div>
            </td>
            <td class="px-4 py-3 text-sm" :class="sideClass(order.side)">
              {{ sideLabel(order.side) }}
            </td>
            <td class="text-text px-4 py-3 text-right text-sm">{{ formatPrice(order.price) }}</td>
            <td class="text-text px-4 py-3 text-right text-sm">
              {{ formatNumber(order.original_size, 4) }}
            </td>
            <td class="text-muted px-4 py-3 text-right text-sm">
              {{ formatNumber(order.size_matched, 4) }}
            </td>
            <td class="text-text px-4 py-3 text-sm">{{ order.outcome || '—' }}</td>
            <td class="px-4 py-3">
              <span
                class="inline-flex min-w-14 justify-center rounded px-1.5 py-0.5 text-[11px] leading-none"
                :class="orderStatusClass(order)"
              >
                {{ orderStatusLabel(order) }}
              </span>
            </td>
            <td class="text-muted px-4 py-3 text-sm">{{ formatTimestamp(order.created_at) }}</td>
            <td class="px-4 py-3 text-center whitespace-nowrap">
              <button
                type="button"
                class="border-border inline-flex h-7 min-w-max items-center gap-1 rounded border px-2.5 text-xs whitespace-nowrap text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                :title="orderActionLabel(order)"
                :disabled="workingOrderId === orderId(order)"
                @click.stop="requestAction(order, canDeleteOrder(order) ? 'delete' : 'cancel')"
              >
                <LoadingSpinner
                  v-if="workingOrderId === orderId(order)"
                  :title="orderActionLabel(order)"
                />
                <Trash2 v-else-if="canDeleteOrder(order)" :size="13" />
                <XCircle v-else :size="13" />
                <span class="whitespace-nowrap">{{ orderActionLabel(order) }}</span>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Transition name="account-asset-dialog">
      <div
        v-if="actionTarget"
        class="app-no-drag fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4"
        @click.self="closeCancelDialog"
      >
        <section
          class="border-border bg-surface w-full max-w-[430px] rounded-lg border shadow-2xl shadow-black/40"
          role="dialog"
          aria-modal="true"
        >
          <header class="border-border flex items-center justify-between gap-4 border-b px-5 py-4">
            <div>
              <h2 class="text-[15px] font-semibold text-white">
                {{ actionTitle() }}
              </h2>
              <p class="text-muted-light mt-1 text-[12px]">
                {{ actionDescription() }}
              </p>
            </div>
            <button
              type="button"
              class="text-muted-light hover:bg-btn-secondary inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:text-white disabled:opacity-50"
              :title="t('common.close')"
              :disabled="!!workingOrderId"
              @click="closeCancelDialog"
            >
              <X :size="16" />
            </button>
          </header>

          <div class="px-5 py-4">
            <p v-if="actionTarget" class="text-text text-[13px] leading-6">
              {{ sideLabel(actionTarget.side) }}
              {{ formatNumber(actionTarget.original_size, 4) }} @
              {{ formatPrice(actionTarget.price) }}
            </p>
            <p
              v-if="dialogError"
              class="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
            >
              {{ dialogError }}
            </p>
          </div>

          <footer class="flex justify-end gap-2 px-5 pb-5">
            <button
              type="button"
              class="bg-btn-secondary hover:bg-btn-secondary-hover inline-flex h-9 items-center rounded-md px-4 text-[13px] font-medium text-white transition-colors disabled:opacity-50"
              :disabled="!!workingOrderId"
              @click="closeCancelDialog"
            >
              {{ t('common.cancel') }}
            </button>
            <button
              type="button"
              class="bg-danger inline-flex h-9 items-center gap-2 rounded-md px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#c92f3a] disabled:opacity-50"
              :disabled="!!workingOrderId"
              @click="confirmCancel"
            >
              <LoadingSpinner v-if="workingOrderId" :size="14" :title="t('order.process')" />
              <template v-else>
                {{ actionMode === 'delete' ? t('order.confirmDelete') : t('order.confirmCancel') }}
              </template>
            </button>
          </footer>
        </section>
      </div>
    </Transition>

    <ContextMenu
      v-model:open="contextMenuOpen"
      :x="contextMenuX"
      :y="contextMenuY"
      :items="contextMenuItems"
      :width="220"
    />
  </div>
</template>

<style scoped>
.account-asset-dialog-enter-active,
.account-asset-dialog-leave-active {
  transition: opacity 130ms ease;
}

.account-asset-dialog-enter-active section,
.account-asset-dialog-leave-active section {
  transition:
    opacity 130ms ease,
    transform 130ms ease;
}

.account-asset-dialog-enter-from,
.account-asset-dialog-leave-to {
  opacity: 0;
}

.account-asset-dialog-enter-from section,
.account-asset-dialog-leave-to section {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}
</style>
