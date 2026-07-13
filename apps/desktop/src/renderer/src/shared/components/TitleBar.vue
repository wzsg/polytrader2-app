<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Minus, Pin, Square, X } from '@lucide/vue';
import { translateUiKey } from '../i18n';
import brandIconUrl from '../../assets/project-brand.svg';

const props = withDefaults(
  defineProps<{
    title?: string;
    subtitle?: string;
    statusText?: string;
    pinnable?: boolean;
    showBrandIcon?: boolean;
    iconUrl?: string;
    customClose?: boolean;
    windowControls?: 'full' | 'close-only' | 'none';
  }>(),
  {
    title: 'Polytrader2',
    subtitle: '',
    statusText: '',
    pinnable: false,
    showBrandIcon: false,
    iconUrl: '',
    customClose: false,
    windowControls: 'full',
  },
);

const emit = defineEmits<{
  close: [];
}>();

const isMaximized = ref(false);
const isPinned = ref(false);
const isMac = navigator.userAgent.includes('Macintosh');
const fullWindowControls = computed(() => props.windowControls === 'full');
const showCustomWindowControls = computed(() => !isMac && fullWindowControls.value);
const showCloseControl = computed(() => !isMac && props.windowControls !== 'none');

let unsubscribe: (() => void) | null = null;

async function refreshMaximized() {
  if (!showCustomWindowControls.value) return;
  isMaximized.value = await window.api.windowIsMaximized();
}

async function refreshPinned() {
  if (!props.pinnable) return;
  isPinned.value = await window.api.windowIsAlwaysOnTop();
}

function minimize() {
  if (!showCustomWindowControls.value) return;
  window.api.windowMinimize();
}

async function toggleMaximize() {
  if (!showCustomWindowControls.value) return;
  await window.api.windowMaximize();
  await refreshMaximized();
}

async function togglePinned() {
  isPinned.value = await window.api.windowSetAlwaysOnTop(!isPinned.value);
}

function close() {
  if (props.customClose) {
    emit('close');
    return;
  }
  window.api.windowClose();
}

onMounted(async () => {
  if (props.pinnable) await refreshPinned();
  if (!showCustomWindowControls.value) return;
  await refreshMaximized();
  unsubscribe = window.api.onWindowMaximizedChanged((maximized) => {
    isMaximized.value = maximized;
  });
});

onUnmounted(() => {
  unsubscribe?.();
});
</script>

<template>
  <header
    class="app-drag-region border-border bg-sidebar relative flex h-9 shrink-0 items-stretch border-b select-none"
    @dblclick="toggleMaximize"
  >
    <div
      class="flex min-w-0 items-center gap-2"
      :class="isMac ? 'absolute inset-x-20 h-full justify-center' : 'flex-1 px-4'"
    >
      <img
        v-if="!isMac && (iconUrl || showBrandIcon)"
        :src="iconUrl || brandIconUrl"
        alt=""
        aria-hidden="true"
        class="h-5 w-5 shrink-0 rounded object-cover"
        draggable="false"
      />
      <div class="flex min-w-0 items-baseline gap-2">
        <span class="shrink-0 text-[13px] leading-none font-semibold tracking-wide text-white">
          {{ title }}
        </span>
        <span
          v-if="subtitle"
          class="text-muted min-w-0 truncate text-[11px] leading-none"
          :title="subtitle"
        >
          {{ subtitle }}
        </span>
        <slot name="subtitle-action" />
        <span
          v-if="statusText"
          class="text-muted-light min-w-0 truncate text-[11px] leading-none"
          :title="statusText"
        >
          {{ statusText }}
        </span>
      </div>
    </div>

    <div class="app-no-drag ml-auto flex shrink-0 items-stretch">
      <button
        v-if="pinnable"
        type="button"
        class="inline-flex w-11 items-center justify-center transition-colors hover:bg-[#1e1e35]"
        :class="isPinned ? 'text-primary-light' : 'text-muted-light hover:text-text'"
        :title="isPinned ? translateUiKey('window.unpin') : translateUiKey('window.pin')"
        @click="togglePinned"
      >
        <Pin :size="14" :stroke-width="2" :class="{ 'rotate-45': isPinned }" />
      </button>

      <button
        v-if="showCustomWindowControls"
        type="button"
        class="text-muted-light hover:text-text inline-flex w-11 items-center justify-center transition-colors hover:bg-[#1e1e35]"
        :title="translateUiKey('window.minimize')"
        @click="minimize"
      >
        <Minus :size="14" :stroke-width="2" />
      </button>

      <button
        v-if="showCustomWindowControls"
        type="button"
        class="text-muted-light hover:text-text inline-flex w-11 items-center justify-center transition-colors hover:bg-[#1e1e35]"
        :title="isMaximized ? translateUiKey('window.restore') : translateUiKey('window.maximize')"
        @click="toggleMaximize"
      >
        <Square v-if="!isMaximized" :size="12" :stroke-width="2" />
        <svg
          v-else
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 12 12"
          class="h-3 w-3 fill-none stroke-current"
          stroke-width="1.5"
        >
          <rect x="2.5" y="0.75" width="8.5" height="8.5" rx="0.5" />
          <rect x="0.75" y="2.5" width="8.5" height="8.5" rx="0.5" />
        </svg>
      </button>

      <button
        v-if="showCloseControl"
        type="button"
        class="text-muted-light hover:bg-danger inline-flex w-11 items-center justify-center transition-colors hover:text-white"
        :title="translateUiKey('common.close')"
        @click="close"
      >
        <X :size="14" :stroke-width="2" />
      </button>
    </div>
  </header>
</template>
