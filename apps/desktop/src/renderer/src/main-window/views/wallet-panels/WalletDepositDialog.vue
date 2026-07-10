<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import QRCode from 'qrcode';
import { Check, Copy, LoaderCircle, X } from '@lucide/vue';
import type {
  PolymarketBridgeAddressResponse,
  PolymarketBridgeSupportedAsset,
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
}>();

const { t } = useI18n();
const assets = ref<PolymarketBridgeSupportedAsset[]>([]);
const selectedChainId = ref('');
const selectedTokenAddress = ref('');
const deposit = ref<PolymarketBridgeAddressResponse | null>(null);
const qrCodeUrl = ref('');
const loading = ref(false);
const error = ref('');
const copied = ref(false);

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

const depositAddress = computed(() => {
  const asset = selectedAsset.value;
  if (!asset || !deposit.value) return '';
  if (isSolanaChain(asset.chainId)) return deposit.value.address.svm ?? '';
  if (isBitcoinChain(asset.chainId)) return deposit.value.address.btc ?? '';
  if (isTronChain(asset.chainId)) return deposit.value.address.tvm ?? '';
  return deposit.value.address.evm ?? '';
});

watch(
  () => props.open,
  (open) => {
    if (open) void load();
  },
);

watch(depositAddress, (address) => {
  void updateQrCode(address);
});

async function load(): Promise<void> {
  if (!props.wallet) return;
  loading.value = true;
  error.value = '';
  deposit.value = null;
  qrCodeUrl.value = '';
  try {
    const [assetResult, depositResult] = await Promise.all([
      window.api.crossChain.listSupportedAssets(),
      window.api.crossChain.createDeposit({ walletId: props.wallet.id }),
    ]);
    if (!assetResult.ok) throw new Error(assetResult.error);
    if (!depositResult.ok) throw new Error(depositResult.error);
    assets.value = assetResult.data.supportedAssets;
    selectInitialAsset();
    deposit.value = depositResult.data;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

function selectInitialAsset(): void {
  if (!props.wallet) return;
  const selection = resolveBridgeAssetSelection('deposit', props.wallet.id, assets.value);
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
  writeBridgeAssetSelection('deposit', props.wallet.id, {
    chainId: selectedChainId.value,
    tokenAddress: selectedTokenAddress.value,
  });
}

async function updateQrCode(address: string): Promise<void> {
  if (!address) {
    qrCodeUrl.value = '';
    return;
  }
  qrCodeUrl.value = await QRCode.toDataURL(address, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 220,
    color: {
      dark: '#111827',
      light: '#ffffff',
    },
  });
}

async function copyAddress(): Promise<void> {
  const address = depositAddress.value;
  if (!address) return;
  await navigator.clipboard.writeText(address);
  copied.value = true;
  window.setTimeout(() => {
    copied.value = false;
  }, 1200);
}

function chainLabel(asset: PolymarketBridgeSupportedAsset): string {
  return asset.chainName ?? asset.chain?.name ?? asset.chainId;
}

function tokenLabel(asset: PolymarketBridgeSupportedAsset): string {
  return asset.token.symbol ?? asset.token.name ?? asset.token.address;
}

function isSolanaChain(chainId: string): boolean {
  return chainId === '1151111081099710';
}

function isBitcoinChain(chainId: string): boolean {
  return chainId === '8253038';
}

function isTronChain(chainId: string): boolean {
  return chainId === '728126428';
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="app-no-drag fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-deposit-dialog-title"
      @click.self="emit('close')"
      @keydown.esc="emit('close')"
    >
      <section class="border-border bg-surface flex w-full max-w-lg flex-col rounded-lg border">
        <header class="border-border flex items-center justify-between gap-3 border-b px-5 py-4">
          <div class="min-w-0">
            <h2 id="wallet-deposit-dialog-title" class="text-sm font-semibold text-white">
              {{ t('bridge.depositTitle') }}
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

        <div class="space-y-4 px-5 py-4">
          <div
            v-if="loading"
            class="flex h-56 items-center justify-center"
            :title="t('bridge.loadDeposit')"
          >
            <LoaderCircle :size="24" class="text-primary animate-spin" />
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

            <div class="flex flex-col items-center gap-3">
              <img
                v-if="qrCodeUrl"
                :src="qrCodeUrl"
                class="h-[220px] w-[220px] rounded-md bg-white p-2"
                :alt="t('bridge.depositQr')"
              />
              <div
                v-else
                class="border-border text-muted-light flex h-[220px] w-[220px] items-center justify-center rounded-md border"
              >
                <LoaderCircle :size="22" class="animate-spin" :title="t('bridge.depositQr')" />
              </div>
              <div class="flex w-full justify-center">
                <code
                  class="selectable-text bg-bg text-text inline-block max-w-full rounded-md p-3 text-center text-xs break-all"
                >
                  {{ depositAddress || t('bridge.noDepositAddress') }}
                </code>
              </div>
              <p class="text-muted-light text-center text-xs">
                {{
                  selectedAsset?.minCheckoutUsd == null
                    ? t('bridge.minimumDepositUnavailable')
                    : t('bridge.minimumDepositValue', {
                        amount: `$${selectedAsset.minCheckoutUsd}`,
                      })
                }}
              </p>
            </div>
          </template>
        </div>

        <footer class="border-border flex justify-end gap-2 border-t px-5 py-4">
          <button
            type="button"
            class="border-border bg-btn-secondary text-text hover:bg-btn-secondary-hover inline-flex h-9 items-center gap-2 rounded-md border px-4 text-sm transition-colors disabled:opacity-60"
            :disabled="!depositAddress"
            @click="copyAddress"
          >
            <Check v-if="copied" :size="15" />
            <Copy v-else :size="15" />
            {{ copied ? t('common.copied') : t('common.copy') }}
          </button>
          <button
            type="button"
            class="bg-btn-secondary hover:bg-btn-secondary-hover text-text inline-flex h-9 items-center rounded-md px-4 text-sm transition-colors"
            @click="emit('close')"
          >
            {{ t('common.close') }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
