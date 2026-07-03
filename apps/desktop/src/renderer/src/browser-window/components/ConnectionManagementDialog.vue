<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { LoaderCircle, ShieldCheck, Unplug } from '@lucide/vue';
import type { BrowserWalletConnectionState } from '@polytrader/shared';

const props = defineProps<{
  origin: string;
  walletConnection: BrowserWalletConnectionState;
  disconnecting: boolean;
}>();

const emit = defineEmits<{
  close: [];
  disconnect: [];
}>();

const accounts = computed(() => props.walletConnection.accounts);
const { t } = useI18n();
</script>

<template>
  <div class="app-no-drag bg-surface flex h-full min-h-0 items-stretch">
    <section
      class="border-border bg-surface flex min-h-0 w-full flex-col border"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-connection-title"
    >
      <header class="border-border flex items-start gap-3 border-b px-5 py-4">
        <div
          class="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-300"
        >
          <ShieldCheck :size="18" />
        </div>
        <div class="min-w-0 flex-1">
          <h2 id="wallet-connection-title" class="text-[15px] font-semibold text-white">
            {{ t('browser.walletConnection') }}
          </h2>
          <p class="text-muted-light mt-1 truncate text-xs" :title="origin">
            {{ origin }}
          </p>
        </div>
      </header>

      <div class="min-h-0 overflow-auto px-5 py-4">
        <div class="grid gap-3 text-sm">
          <div>
            <p class="text-muted text-xs">{{ t('common.status') }}</p>
            <p class="mt-1 text-emerald-300">{{ t('browser.connected') }}</p>
          </div>

          <div>
            <p class="text-muted text-xs">{{ t('browser.connectedAccount') }}</p>
            <div class="mt-2 grid gap-2">
              <div
                v-for="account in accounts"
                :key="account.id"
                class="border-border bg-bg rounded-md border px-3 py-2"
              >
                <div class="flex min-w-0 items-center justify-between gap-3">
                  <span class="text-text truncate text-sm">{{ account.name }}</span>
                  <span class="text-muted-light shrink-0 text-xs">Polygon</span>
                </div>
                <p class="selectable-text text-muted mt-1 font-mono text-xs">
                  {{ account.walletAddress }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer class="border-border flex justify-end gap-2 border-t px-5 py-4">
        <button
          type="button"
          class="bg-btn-secondary hover:bg-btn-secondary-hover inline-flex h-9 items-center rounded-md px-4 text-[13px] font-medium text-white transition-colors"
          @click="emit('close')"
        >
          {{ t('common.close') }}
        </button>
        <button
          type="button"
          class="bg-danger hover:bg-danger/90 inline-flex h-9 items-center gap-2 rounded-md px-4 text-[13px] font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="disconnecting"
          @click="emit('disconnect')"
        >
          <LoaderCircle
            v-if="disconnecting"
            :size="15"
            class="animate-spin"
            :aria-label="t('browser.disconnecting')"
          />
          <Unplug v-else :size="15" />
          {{ t('browser.disconnect') }}
        </button>
      </footer>
    </section>
  </div>
</template>
