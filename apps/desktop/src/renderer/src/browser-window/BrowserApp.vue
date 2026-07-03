<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowLeft, ArrowRight, Globe2, LoaderCircle, RefreshCw, Wallet, X } from '@lucide/vue';
import { POLYMARKET_WEB_URL, type BrowserNavigationState } from '@polytrader/shared';
import TitleBar from '../shared/components/TitleBar.vue';

const DEFAULT_URL = POLYMARKET_WEB_URL;

const { t } = useI18n();

const viewportRef = ref<HTMLElement | null>(null);
const addressInput = ref(DEFAULT_URL);
const error = ref('');
const state = ref<BrowserNavigationState>({
  url: DEFAULT_URL,
  title: '',
  canGoBack: false,
  canGoForward: false,
  isLoading: false,
  walletConnection: {
    connected: false,
    accounts: [],
  },
  error: null,
});
const browserTitle = computed(() => {
  const title = state.value.title.trim();
  if (title) return title;

  try {
    return new URL(state.value.url).hostname;
  } catch {
    return state.value.url || DEFAULT_URL;
  }
});
const walletStatusLabel = computed(() => {
  return state.value.walletConnection.connected
    ? t('browser.connected')
    : t('browser.disconnected');
});
const walletStatusTitle = computed(() => {
  const accounts = state.value.walletConnection.accounts;
  if (!accounts.length) return t('browser.noWalletConnection');
  return t('browser.connectedAccounts', {
    accounts: accounts.map((account) => `${account.name} · ${account.walletAddress}`).join(', '),
  });
});
let resizeObserver: ResizeObserver | null = null;
let unsubscribeNavigation: (() => void) | null = null;
let frameRequest = 0;

function applyState(nextState: BrowserNavigationState): void {
  state.value = nextState;
  addressInput.value = nextState.url || addressInput.value;
  error.value = nextState.error || '';
}

function scheduleBoundsUpdate(): void {
  if (frameRequest) cancelAnimationFrame(frameRequest);
  frameRequest = requestAnimationFrame(() => {
    frameRequest = 0;
    void updateViewBounds();
  });
}

async function updateViewBounds(): Promise<void> {
  const element = viewportRef.value;
  if (!element) return;

  const rect = element.getBoundingClientRect();
  await window.api.browserSetViewBounds({
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  });
}

async function navigate(): Promise<void> {
  error.value = '';
  const result = await window.api.browserNavigate(addressInput.value);
  if (result.ok) {
    applyState(result.data);
  } else {
    error.value = result.error;
  }
}

async function goBack(): Promise<void> {
  const result = await window.api.browserGoBack();
  if (result.ok) applyState(result.data);
}

async function goForward(): Promise<void> {
  const result = await window.api.browserGoForward();
  if (result.ok) applyState(result.data);
}

async function reloadOrStop(): Promise<void> {
  const result = state.value.isLoading
    ? await window.api.browserStop()
    : await window.api.browserReload();
  if (result.ok) applyState(result.data);
}

async function openConnectionDialog(): Promise<void> {
  if (!state.value.walletConnection.connected) return;
  const result = await window.api.browserOpenConnectionDialog();
  if (!result.ok) error.value = result.error;
}

onMounted(async () => {
  unsubscribeNavigation = window.api.onBrowserNavigationState(applyState);
  resizeObserver = new ResizeObserver(scheduleBoundsUpdate);
  if (viewportRef.value) resizeObserver.observe(viewportRef.value);
  window.addEventListener('resize', scheduleBoundsUpdate);

  const result = await window.api.browserGetState();
  if (result.ok) applyState(result.data);
  await nextTick();
  scheduleBoundsUpdate();
});

onUnmounted(() => {
  unsubscribeNavigation?.();
  resizeObserver?.disconnect();
  window.removeEventListener('resize', scheduleBoundsUpdate);
  if (frameRequest) cancelAnimationFrame(frameRequest);
});
</script>

<template>
  <div class="flex h-full flex-col">
    <TitleBar
      title="Polytrader2"
      :subtitle="browserTitle"
      :icon-url="state.faviconUrl || ''"
      pinnable
    />

    <form
      class="app-no-drag border-border bg-sidebar flex h-13 shrink-0 items-center gap-2 border-b px-3"
      @submit.prevent="navigate"
    >
      <button
        type="button"
        class="text-muted-light hover:bg-btn-secondary inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        :title="t('browser.back')"
        :disabled="!state.canGoBack"
        @click="goBack"
      >
        <ArrowLeft :size="16" />
      </button>
      <button
        type="button"
        class="text-muted-light hover:bg-btn-secondary inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        :title="t('browser.forward')"
        :disabled="!state.canGoForward"
        @click="goForward"
      >
        <ArrowRight :size="16" />
      </button>
      <button
        type="button"
        class="text-muted-light hover:bg-btn-secondary inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:text-white"
        :title="state.isLoading ? t('browser.stop') : t('common.refresh')"
        @click="reloadOrStop"
      >
        <X v-if="state.isLoading" :size="16" />
        <RefreshCw v-else :size="16" />
      </button>

      <div
        class="border-border bg-bg focus-within:border-primary flex min-w-0 flex-1 items-center gap-2 rounded-md border px-3 py-1.5"
      >
        <LoaderCircle v-if="state.isLoading" class="text-primary-light animate-spin" :size="15" />
        <Globe2 v-else class="text-muted-light" :size="15" />
        <input
          v-model="addressInput"
          class="text-text min-w-0 flex-1 bg-transparent text-sm outline-none"
          spellcheck="false"
          autocomplete="off"
        />
      </div>

      <button
        type="button"
        class="border-border bg-bg text-muted-light inline-flex h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-xs transition-colors"
        :class="
          state.walletConnection.connected
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15'
            : 'cursor-default'
        "
        :title="walletStatusTitle"
        aria-live="polite"
        @click="openConnectionDialog"
      >
        <Wallet :size="15" class="shrink-0" />
        <span>{{ walletStatusLabel }}</span>
      </button>
    </form>

    <div
      v-if="error"
      class="border-border bg-danger/10 shrink-0 border-b px-4 py-2 text-sm text-red-200"
    >
      {{ error }}
    </div>

    <main ref="viewportRef" class="bg-bg relative min-h-0 flex-1 overflow-hidden"></main>
  </div>
</template>
