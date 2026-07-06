<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Check, ShieldCheck } from '@lucide/vue';
import type { BrowserProviderRequest } from '@polytrader/shared';

const props = defineProps<{
  request: BrowserProviderRequest;
}>();

const emit = defineEmits<{
  reject: [];
  approve: [walletId?: string];
}>();

const selectedWalletId = ref('');
const { t } = useI18n();

const activeRequestAccount = computed(() => {
  return props.request.accounts.find((account) => account.id === selectedWalletId.value) ?? null;
});

const decodedMessage = computed(() => decodeHexUtf8Message(props.request.message));
const transactionPreview = computed(() => props.request.transactionPreview ?? null);

const shouldShowRawMessage = computed(() => {
  return Boolean(props.request.message && !decodedMessage.value && !transactionPreview.value);
});

const shouldShowTransactionRawDetails = computed(() => {
  return Boolean(props.request.message && transactionPreview.value);
});

const requestTitle = computed(() => {
  if (props.request.kind === 'connect') return t('browser.connectWallet');
  if (props.request.kind === 'transaction') return t('browser.transactionRequest');
  return t('browser.signRequest');
});

const approveDisabled = computed(() => {
  return props.request.kind === 'connect' && !selectedWalletId.value;
});

function compactAddress(address: string): string {
  return address.length > 14 ? `${address.slice(0, 8)}...${address.slice(-6)}` : address;
}

function transactionKindLabel(kind: string): string {
  if (kind === 'erc20-transfer') return t('browser.erc20Transfer');
  if (kind === 'erc20-approve') return t('browser.erc20Approval');
  if (kind === 'native-transfer') return t('browser.nativeTransfer');
  return t('browser.contractCall');
}

function tokenLabel(): string {
  const preview = transactionPreview.value;
  if (!preview) return '';
  return preview.tokenSymbol || preview.tokenName || compactAddress(preview.tokenAddress || '');
}

function amountLabel(): string {
  const preview = transactionPreview.value;
  if (!preview) return '';
  if (preview.amountFormatted) return preview.amountFormatted;
  if (preview.nativeValueFormatted) return `${preview.nativeValueFormatted} POL`;
  return '';
}

function formatMethod(method: string): string {
  if (method === 'eth_requestAccounts') return 'eth_requestAccounts';
  if (method === 'eth_sendTransaction') return 'eth_sendTransaction';
  if (method === 'wallet_sendCalls') return 'wallet_sendCalls';
  if (method === 'personal_sign') return 'personal_sign';
  if (method === 'eth_signTypedData') return 'eth_signTypedData';
  if (method === 'eth_signTypedData_v3') return 'eth_signTypedData_v3';
  if (method === 'eth_signTypedData_v4') return 'eth_signTypedData_v4';
  return method;
}

function decodeHexUtf8Message(message?: string): string | null {
  const trimmed = message?.trim();
  if (!trimmed || !/^0x(?:[0-9a-fA-F]{2})+$/.test(trimmed)) return null;

  const bytes = new Uint8Array((trimmed.length - 2) / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(trimmed.slice(2 + index * 2, 4 + index * 2), 16);
  }

  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!isReadableSignatureText(decoded)) return null;
    return decoded;
  } catch {
    return null;
  }
}

function isReadableSignatureText(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (
      (code >= 0 && code <= 8) ||
      code === 11 ||
      code === 12 ||
      (code >= 14 && code <= 31) ||
      code === 127
    ) {
      return false;
    }
  }
  return true;
}

function approve(): void {
  emit('approve', selectedWalletId.value || props.request.walletId);
}

watch(
  () => props.request,
  (request) => {
    selectedWalletId.value =
      request.walletId ||
      request.accounts.find((account) => account.isDefault)?.id ||
      request.accounts[0]?.id ||
      '';
  },
  { immediate: true },
);
</script>

<template>
  <div class="app-no-drag bg-surface flex h-full min-h-0 items-stretch">
    <section
      class="border-border bg-surface flex min-h-0 w-full flex-col border"
      role="dialog"
      aria-modal="true"
      aria-labelledby="provider-request-title"
    >
      <header class="border-border flex items-start gap-3 border-b px-5 py-4">
        <div
          class="bg-primary/20 text-primary-light mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
        >
          <ShieldCheck :size="18" />
        </div>
        <div class="min-w-0 flex-1">
          <h2 id="provider-request-title" class="text-[15px] font-semibold text-white">
            {{ requestTitle }}
          </h2>
          <p class="text-muted-light mt-1 truncate text-xs">{{ request.origin }}</p>
        </div>
      </header>

      <div class="min-h-0 overflow-auto px-5 py-4">
        <div class="grid gap-3 text-sm">
          <div>
            <p class="text-muted text-xs">{{ t('browser.method') }}</p>
            <p class="selectable-text text-text mt-1 font-mono text-xs">
              {{ formatMethod(request.method) }}
            </p>
          </div>

          <label v-if="request.kind === 'connect'" class="block">
            <span class="text-muted mb-1 block text-xs">{{ t('common.account') }}</span>
            <select
              v-model="selectedWalletId"
              class="border-border bg-bg text-text focus:border-primary w-full rounded-md border px-3 py-2 text-sm outline-none"
            >
              <option v-for="account in request.accounts" :key="account.id" :value="account.id">
                {{ account.name }} · {{ compactAddress(account.walletAddress) }}
              </option>
            </select>
          </label>

          <div v-else-if="activeRequestAccount || request.accountAddress">
            <p class="text-muted text-xs">{{ t('common.account') }}</p>
            <p class="selectable-text text-text mt-1 font-mono text-xs">
              {{
                activeRequestAccount
                  ? `${activeRequestAccount.name} · ${compactAddress(activeRequestAccount.walletAddress)}`
                  : compactAddress(request.accountAddress || '')
              }}
            </p>
          </div>

          <div
            v-if="transactionPreview"
            class="border-border bg-bg/60 grid gap-3 rounded-md border p-3"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-muted text-xs">{{ t('browser.transactionType') }}</p>
                <p class="text-text mt-1 text-sm font-semibold">
                  {{ transactionKindLabel(transactionPreview.kind) }}
                </p>
              </div>
              <div
                v-if="tokenLabel()"
                class="border-border bg-surface max-w-[42%] shrink-0 truncate rounded-md border px-2 py-1 text-right text-xs font-medium text-white"
                :title="transactionPreview.tokenName || tokenLabel()"
              >
                {{ tokenLabel() }}
              </div>
            </div>

            <div v-if="amountLabel()">
              <p class="text-muted text-xs">{{ t('browser.amount') }}</p>
              <p
                class="selectable-text text-text mt-1 font-mono text-[15px] font-semibold break-all"
              >
                {{ amountLabel() }}
                <span
                  v-if="transactionPreview.amountFormatted && tokenLabel()"
                  class="text-muted-light ml-1 font-sans text-xs"
                >
                  {{ tokenLabel() }}
                </span>
              </p>
            </div>

            <div v-if="transactionPreview.to">
              <p class="text-muted text-xs">{{ t('browser.recipient') }}</p>
              <p class="selectable-text text-text mt-1 font-mono text-xs break-all">
                {{ transactionPreview.to }}
              </p>
            </div>

            <div v-if="transactionPreview.spender">
              <p class="text-muted text-xs">{{ t('browser.spender') }}</p>
              <p class="selectable-text text-text mt-1 font-mono text-xs break-all">
                {{ transactionPreview.spender }}
              </p>
            </div>

            <div v-if="transactionPreview.contractAddress || transactionPreview.tokenAddress">
              <p class="text-muted text-xs">{{ t('browser.contract') }}</p>
              <p class="selectable-text text-text mt-1 font-mono text-xs break-all">
                {{ transactionPreview.contractAddress || transactionPreview.tokenAddress }}
              </p>
            </div>
          </div>

          <div v-if="decodedMessage">
            <p class="text-muted text-xs">{{ t('browser.content') }}</p>
            <textarea
              class="border-border bg-bg text-text mt-1 h-32 max-h-[240px] min-h-24 w-full resize-y overflow-x-hidden overflow-y-auto rounded-md border p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap outline-none"
              readonly
              :aria-label="t('browser.decodedContent')"
              :title="t('browser.decodedContentTitle')"
              :value="decodedMessage"
            />
          </div>

          <details v-if="shouldShowTransactionRawDetails" class="group">
            <summary class="text-muted hover:text-text cursor-pointer text-xs">
              {{ t('browser.rawContent') }}
            </summary>
            <textarea
              class="border-border bg-bg text-muted-light mt-2 h-20 max-h-[140px] min-h-16 w-full resize-y overflow-x-hidden overflow-y-auto rounded-md border p-3 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap outline-none"
              readonly
              :aria-label="t('browser.rawTransactionContent')"
              :title="t('browser.rawTransactionContentTitle')"
              :value="request.message"
            />
          </details>

          <div v-if="shouldShowRawMessage">
            <p class="text-muted text-xs">{{ t('browser.rawContent') }}</p>
            <textarea
              class="border-border bg-bg text-muted-light mt-1 h-24 max-h-[180px] min-h-20 w-full resize-y overflow-x-hidden overflow-y-auto rounded-md border p-3 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap outline-none"
              readonly
              :aria-label="t('browser.rawSignatureContent')"
              :title="t('browser.rawSignatureContentTitle')"
              :value="request.message"
            />
          </div>

          <p
            v-if="request.kind === 'connect' && !request.accounts.length"
            class="text-sm text-amber-300"
          >
            {{ t('browser.noAvailableAccounts') }}
          </p>
        </div>
      </div>

      <footer class="border-border flex justify-end gap-2 border-t px-5 py-4">
        <button
          type="button"
          class="bg-btn-secondary hover:bg-btn-secondary-hover inline-flex h-9 items-center rounded-md px-4 text-[13px] font-medium text-white transition-colors"
          @click="emit('reject')"
        >
          {{ t('browser.reject') }}
        </button>
        <button
          type="button"
          class="bg-primary hover:bg-primary-hover inline-flex h-9 items-center gap-2 rounded-md px-4 text-[13px] font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="approveDisabled"
          @click="approve"
        >
          <Check :size="15" />
          {{ t('browser.allow') }}
        </button>
      </footer>
    </section>
  </div>
</template>
