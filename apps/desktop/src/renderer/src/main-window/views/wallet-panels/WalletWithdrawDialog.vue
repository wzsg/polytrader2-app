<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { LoaderCircle, X } from '@lucide/vue';
import type {
  PolymarketBridgeSupportedAsset,
  PolymarketBridgeWithdrawalRecord,
  PolymarketWalletSummary,
} from '@polytrader/shared';
import IconSelect from '@/shared/components/IconSelect.vue';
import {
  resolveBridgeAssetSelection,
  writeBridgeAssetSelection,
} from './bridgeAssetSelectionMemory';

const props = defineProps<{
  open: boolean;
  wallet: PolymarketWalletSummary | null;
}>();

const emit = defineEmits<{
  close: [];
  submitted: [];
}>();

const { t } = useI18n();
const assets = ref<PolymarketBridgeSupportedAsset[]>([]);
const selectedChainId = ref('');
const selectedTokenAddress = ref('');
const recipientAddr = ref('');
const amount = ref('');
const loading = ref(false);
const submitting = ref(false);
const error = ref('');
const result = ref<PolymarketBridgeWithdrawalRecord | null>(null);
let unsubscribeWithdrawalEvent: (() => void) | null = null;

type WithdrawalResult = 'succeeded' | 'failed' | 'timed_out';

const chains = computed(() => {
  const byChainId = new Map<string, PolymarketBridgeSupportedAsset>();
  for (const asset of assets.value) {
    if (!byChainId.has(asset.chainId)) byChainId.set(asset.chainId, asset);
  }
  return [...byChainId.values()];
});

const tokenAssets = computed(() =>
  assets.value.filter((asset) => asset.chainId === selectedChainId.value),
);

const chainOptions = computed(() =>
  chains.value.map((chain) => ({
    value: chain.chainId,
    label: chainLabel(chain),
    iconUrl: chain.chain?.iconUrl,
  })),
);

const tokenOptions = computed(() =>
  tokenAssets.value.map((asset) => ({
    value: asset.token.address,
    label: tokenLabel(asset),
    iconUrl: asset.token.iconUrl,
  })),
);

const selectedAsset = computed(
  () =>
    tokenAssets.value.find((asset) => asset.token.address === selectedTokenAddress.value) ?? null,
);

const selectedTokenAddressModel = computed({
  get: () => selectedTokenAddress.value,
  set: (tokenAddress: string) => selectToken(tokenAddress),
});

const withdrawalResult = computed<WithdrawalResult | null>(() => {
  const status = result.value?.status;
  if (status === 'succeeded' || status === 'failed' || status === 'timed_out') return status;
  return null;
});

const processing = computed(() => Boolean(result.value && !withdrawalResult.value));

const withdrawalResultMessage = computed(() => {
  if (withdrawalResult.value === 'succeeded') return t('bridge.withdrawalResult.succeeded');
  if (withdrawalResult.value === 'failed') return t('bridge.withdrawalResult.failed');
  if (withdrawalResult.value === 'timed_out') return t('bridge.withdrawalResult.timedOut');
  return '';
});

watch(
  () => props.open,
  (open) => {
    if (open) void load();
  },
);

onMounted(() => {
  unsubscribeWithdrawalEvent = window.api.crossChain.onWithdrawalEvent((event) => {
    if (result.value?.id !== event.withdrawal.id) return;
    result.value = event.withdrawal;
    if (event.type === 'succeeded' || event.type === 'failed' || event.type === 'timed-out') {
      emit('submitted');
    }
  });
});

onUnmounted(() => {
  unsubscribeWithdrawalEvent?.();
  unsubscribeWithdrawalEvent = null;
});

async function load(): Promise<void> {
  loading.value = true;
  submitting.value = false;
  error.value = '';
  result.value = null;
  try {
    const res = await window.api.crossChain.listSupportedAssets();
    if (!res.ok) throw new Error(res.error);
    assets.value = res.data.supportedAssets;
    selectInitialAsset();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

function selectInitialAsset(): void {
  if (!props.wallet) return;
  const selection = resolveBridgeAssetSelection('withdraw', props.wallet.id, assets.value);
  selectedChainId.value = selection.chainId;
  selectedTokenAddress.value = selection.tokenAddress;
}

function selectChain(chainId: string): void {
  selectedChainId.value = chainId;
  selectedTokenAddress.value = tokenAssets.value[0]?.token.address ?? '';
  writeCurrentSelection();
}

function selectToken(tokenAddress: string): void {
  selectedTokenAddress.value = tokenAddress;
  writeCurrentSelection();
}

function writeCurrentSelection(): void {
  if (!props.wallet || !selectedChainId.value || !selectedTokenAddress.value) return;
  writeBridgeAssetSelection('withdraw', props.wallet.id, {
    chainId: selectedChainId.value,
    tokenAddress: selectedTokenAddress.value,
  });
}

async function submit(): Promise<void> {
  if (!props.wallet || !selectedAsset.value || submitting.value) return;
  submitting.value = true;
  error.value = '';
  result.value = null;
  try {
    const res = await window.api.crossChain.withdraw({
      walletId: props.wallet.id,
      amount: amount.value,
      toChainId: selectedAsset.value.chainId,
      toTokenAddress: selectedAsset.value.token.address,
      recipientAddr: recipientAddr.value,
    });
    if (!res.ok) throw new Error(res.error);
    result.value = res.data.withdrawal;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    submitting.value = false;
  }
}

function chainLabel(asset: PolymarketBridgeSupportedAsset): string {
  return asset.chainName ?? asset.chain?.name ?? asset.chainId;
}

function tokenLabel(asset: PolymarketBridgeSupportedAsset): string {
  return asset.token.symbol ?? asset.token.name ?? asset.token.address;
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="app-no-drag fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-withdraw-dialog-title"
      @click.self="emit('close')"
      @keydown.esc="emit('close')"
    >
      <section class="border-border bg-surface flex w-full max-w-lg flex-col rounded-lg border">
        <header class="border-border flex items-center justify-between gap-3 border-b px-5 py-4">
          <div class="min-w-0">
            <h2 id="wallet-withdraw-dialog-title" class="text-sm font-semibold text-white">
              {{ t('bridge.withdrawTitle') }}
            </h2>
            <p class="text-muted-light mt-1 truncate text-xs">{{ wallet?.name }}</p>
          </div>
          <button
            type="button"
            class="text-muted-light hover:bg-btn-secondary hover:text-text inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors"
            :aria-label="t('common.close')"
            @click="emit('close')"
          >
            <X :size="16" />
          </button>
        </header>

        <form class="space-y-4 px-5 py-4" @submit.prevent="submit">
          <div
            v-if="loading || submitting || processing"
            class="flex h-44 items-center justify-center"
            :title="loading ? t('bridge.loadWithdrawal') : t('bridge.processingWithdrawal')"
          >
            <LoaderCircle :size="24" class="text-primary animate-spin" />
          </div>
          <div
            v-else-if="withdrawalResult"
            class="flex h-44 flex-col items-center justify-center gap-3 text-center"
          >
            <p
              class="text-base font-medium"
              :class="withdrawalResult === 'succeeded' ? 'text-green-400' : 'text-red-300'"
            >
              {{ withdrawalResultMessage }}
            </p>
            <p
              v-if="withdrawalResult !== 'succeeded' && result?.errorMessage"
              class="max-w-sm text-sm text-red-300"
            >
              {{ result.errorMessage }}
            </p>
          </div>
          <template v-else>
            <p
              v-if="error"
              class="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"
            >
              {{ error }}
            </p>
            <div class="space-y-3">
              <div class="grid grid-cols-2 gap-3">
                <IconSelect
                  :model-value="selectedChainId"
                  :options="chainOptions"
                  :label="t('bridge.chain')"
                  @update:model-value="selectChain"
                />
                <IconSelect
                  v-model="selectedTokenAddressModel"
                  :options="tokenOptions"
                  :label="t('bridge.token')"
                />
              </div>
            </div>
            <label class="block text-sm">
              <span class="text-muted-light mb-1 block text-xs">{{
                t('bridge.recipientAddress')
              }}</span>
              <input
                v-model.trim="recipientAddr"
                class="border-border bg-bg text-text focus:border-primary h-9 w-full rounded-md border px-3 font-mono text-sm outline-none"
                :placeholder="t('bridge.recipientAddressPlaceholder')"
              />
            </label>
            <label class="block text-sm">
              <span class="text-muted-light mb-1 block text-xs">{{ t('common.amountPusd') }}</span>
              <input
                v-model.trim="amount"
                class="border-border bg-bg text-text focus:border-primary h-9 w-full rounded-md border px-3 font-mono text-sm outline-none"
                inputmode="decimal"
                placeholder="0.00"
              />
            </label>

            <p class="text-muted-light text-center text-xs">
              {{
                selectedAsset?.minCheckoutUsd == null
                  ? t('bridge.minimumWithdrawalUnavailable')
                  : t('bridge.minimumWithdrawalValue', {
                      amount: `$${selectedAsset.minCheckoutUsd}`,
                    })
              }}
            </p>
          </template>
        </form>

        <footer class="border-border flex justify-end gap-2 border-t px-5 py-4">
          <button
            type="button"
            class="bg-btn-secondary hover:bg-btn-secondary-hover text-text inline-flex h-9 items-center rounded-md px-4 text-sm transition-colors"
            @click="emit('close')"
          >
            {{ t('common.close') }}
          </button>
          <button
            v-if="!loading && !submitting && !processing && !withdrawalResult"
            type="button"
            class="bg-primary hover:bg-primary-hover inline-flex h-9 min-w-24 items-center justify-center rounded-md px-4 text-sm font-medium text-white transition-colors disabled:opacity-60"
            :disabled="!selectedAsset || !amount || !recipientAddr"
            @click="submit"
          >
            {{ t('common.confirm') }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
