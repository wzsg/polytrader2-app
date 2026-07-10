<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { X } from '@lucide/vue';
import type { BrowserModalPayload } from '@polytrader/shared';
import ConnectionManagementDialog from './components/ConnectionManagementDialog.vue';
import ProviderRequestDialog from './components/ProviderRequestDialog.vue';

const payload = ref<BrowserModalPayload | null>(null);
const error = ref('');
const disconnectingWallet = ref(false);
const { t } = useI18n();
const isMac = navigator.userAgent.includes('Macintosh');
const modalTitle = computed(() => {
  const current = payload.value;
  if (!current) return 'Polytrader2';
  if (current.kind === 'connection-management') return t('browser.connectionManagement');
  return current.request.kind === 'connect' ? t('browser.connectWallet') : t('browser.signRequest');
});

async function closeModal(): Promise<void> {
  await window.api.browserModalClose();
}

async function respondProviderRequest(approved: boolean, walletId?: string): Promise<void> {
  const current = payload.value;
  if (!current || current.kind !== 'provider-request') return;

  const result = await window.api.browserModalRespondProviderRequest({
    id: current.request.id,
    approved,
    walletId: approved ? walletId || current.request.walletId : undefined,
  });
  if (!result.ok) error.value = result.error;
}

async function disconnectWallet(): Promise<void> {
  disconnectingWallet.value = true;
  const result = await window.api.browserModalDisconnectWallet();
  disconnectingWallet.value = false;
  if (!result.ok) error.value = result.error;
}

onMounted(async () => {
  const result = await window.api.browserModalGetPayload();
  if (result.ok) {
    payload.value = result.data;
  } else {
    error.value = result.error;
  }
});
</script>

<template>
  <div class="bg-bg text-text flex h-full min-h-0 flex-col overflow-hidden">
    <header
      class="app-drag-region border-border bg-sidebar flex h-9 shrink-0 items-center justify-between border-b"
    >
      <div
        class="text-muted-light min-w-0 pr-3 text-xs font-medium"
        :class="isMac ? 'pl-20' : 'pl-3'"
      >
        <span class="block truncate">{{ modalTitle }}</span>
      </div>
      <button
        v-if="!isMac"
        type="button"
        class="app-no-drag text-muted-light hover:bg-danger hover:text-text inline-flex h-9 w-11 items-center justify-center transition-colors"
        :title="t('common.close')"
        :aria-label="t('common.close')"
        @click="closeModal"
      >
        <X :size="16" />
      </button>
    </header>

    <div
      v-if="error && payload"
      class="bg-danger/10 border-border shrink-0 border-b px-4 py-2 text-sm text-red-200"
    >
      {{ error }}
    </div>

    <main class="min-h-0 flex-1 overflow-hidden">
      <ProviderRequestDialog
        v-if="payload?.kind === 'provider-request'"
        :request="payload.request"
        @approve="respondProviderRequest(true, $event)"
        @reject="respondProviderRequest(false)"
      />

      <ConnectionManagementDialog
        v-else-if="payload?.kind === 'connection-management'"
        :origin="payload.origin"
        :wallet-connection="payload.walletConnection"
        :disconnecting="disconnectingWallet"
        @close="closeModal"
        @disconnect="disconnectWallet"
      />

      <div v-else class="flex h-full items-center justify-center px-5">
        <p v-if="error" class="text-sm text-red-200">{{ error }}</p>
      </div>
    </main>
  </div>
</template>
