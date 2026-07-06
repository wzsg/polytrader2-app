<script setup lang="ts">
import {
  List,
  Star,
  Bitcoin,
  Trophy,
  Gamepad2,
  Bot,
  Settings,
  Wallet,
  Code2,
  Wrench,
  UserRound,
  RefreshCw,
} from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import type { AuthState } from '@polytrader/shared';

const props = defineProps<{
  activeNav: string;
  developerModeEnabled: boolean;
  authState: AuthState;
  openWatchlistEventCount: number;
  syncState?: string;
  syncStatus?: string;
}>();

const { t } = useI18n();

const emit = defineEmits<{
  'change-nav': [nav: string];
  'open-auth': [];
}>();

const browseItems = [
  { nav: 'watchlist', labelKey: 'nav.watchlist', icon: Star },
  { nav: 'events', labelKey: 'nav.events', icon: List },
  { nav: 'crypto', labelKey: 'nav.crypto', icon: Bitcoin },
  { nav: 'sports', labelKey: 'nav.sports', icon: Trophy },
  { nav: 'esports', labelKey: 'nav.esports', icon: Gamepad2 },
];

const accountItems = [{ nav: 'accounts', labelKey: 'nav.accountManagement', icon: Wallet }];
const strategyAutomationEnabled = __STRATEGY_AUTOMATION_ENABLED__;

const tradingItems = [
  { nav: 'bots', labelKey: 'nav.botManagement', icon: Bot },
  { nav: 'strategies', labelKey: 'nav.strategyManagement', icon: Code2 },
];

function navClass(activeNav: string, nav: string): string {
  return activeNav === nav
    ? 'bg-primary/20 font-medium text-primary-light'
    : 'text-muted-light hover:bg-[#1e1e35] hover:text-text';
}

function authLabel(): string {
  if (!props.authState.configured || props.authState.status === 'disabled')
    return t('auth.disabled');
  if (props.authState.status === 'signed-in') return props.authState.email || t('auth.signedIn');
  if (props.authState.status === 'error') return t('auth.syncState.error');
  return t('auth.notSignedIn');
}

function authHint(): string {
  if (props.authState.status === 'signed-in')
    return t(`auth.syncState.${props.authState.syncState}`);
  if (props.authState.status === 'error' && props.authState.error) return props.authState.error;
  return t('auth.openAccountPanel');
}
</script>

<template>
  <aside class="border-border bg-sidebar flex h-full w-[200px] shrink-0 flex-col border-r py-5">
    <nav class="flex min-h-0 flex-1 flex-col gap-1 px-3">
      <div class="text-muted px-3.5 pt-2 pb-1 text-[11px] font-semibold tracking-wide uppercase">
        {{ t('nav.browse') }}
      </div>
      <button
        v-for="item in browseItems"
        :key="item.nav"
        type="button"
        class="flex w-full items-center gap-2 rounded-md px-3.5 py-2.5 text-left text-sm transition-colors"
        :class="navClass(activeNav, item.nav)"
        @click="emit('change-nav', item.nav)"
      >
        <component :is="item.icon" :size="16" />
        <span class="flex min-w-0 flex-1 items-center gap-1.5">
          <span class="min-w-0 truncate">{{ t(item.labelKey) }}</span>
          <span
            v-if="item.nav === 'watchlist' && openWatchlistEventCount > 0"
            class="border-border bg-btn-secondary/60 text-muted-light inline-flex h-3.5 min-w-3.5 shrink-0 items-center justify-center rounded px-1 text-[9px] leading-none font-medium tabular-nums"
          >
            {{ openWatchlistEventCount }}
          </span>
        </span>
      </button>

      <template v-if="strategyAutomationEnabled">
        <div
          class="text-muted mt-3 px-3.5 pt-2 pb-1 text-[11px] font-semibold tracking-wide uppercase"
        >
          {{ t('nav.trading') }}
        </div>
        <button
          v-for="item in tradingItems"
          :key="item.nav"
          type="button"
          class="flex w-full items-center gap-2 rounded-md px-3.5 py-2.5 text-left text-sm transition-colors"
          :class="navClass(activeNav, item.nav)"
          @click="emit('change-nav', item.nav)"
        >
          <component :is="item.icon" :size="16" />
          {{ t(item.labelKey) }}
        </button>
      </template>

      <div
        class="text-muted mt-3 px-3.5 pt-2 pb-1 text-[11px] font-semibold tracking-wide uppercase"
      >
        {{ t('nav.polymarket') }}
      </div>
      <button
        v-for="item in accountItems"
        :key="item.nav"
        type="button"
        class="flex w-full items-center gap-2 rounded-md px-3.5 py-2.5 text-left text-sm transition-colors"
        :class="navClass(activeNav, item.nav)"
        @click="emit('change-nav', item.nav)"
      >
        <component :is="item.icon" :size="16" />
        {{ t(item.labelKey) }}
      </button>

      <div
        class="text-muted mt-3 px-3.5 pt-2 pb-1 text-[11px] font-semibold tracking-wide uppercase"
      >
        {{ t('nav.system') }}
      </div>
      <button
        type="button"
        class="flex w-full items-center gap-2 rounded-md px-3.5 py-2.5 text-left text-sm transition-colors"
        :class="navClass(activeNav, 'settings')"
        @click="emit('change-nav', 'settings')"
      >
        <Settings :size="16" />
        {{ t('nav.settings') }}
      </button>
      <button
        v-if="developerModeEnabled"
        type="button"
        class="flex w-full items-center gap-2 rounded-md px-3.5 py-2.5 text-left text-sm transition-colors"
        :class="navClass(activeNav, 'developer')"
        @click="emit('change-nav', 'developer')"
      >
        <Wrench :size="16" />
        {{ t('nav.developerMode') }}
      </button>
    </nav>

    <div class="border-border mt-4 border-t px-3 pt-4">
      <button
        type="button"
        class="hover:bg-btn-secondary flex w-full min-w-0 items-center gap-2 rounded-md px-3 py-2 text-left transition-colors"
        :title="authLabel()"
        :aria-label="t('auth.account')"
        @click="emit('open-auth')"
      >
        <UserRound :size="17" class="text-primary-light shrink-0" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-white">{{ authLabel() }}</p>
          <p class="text-muted truncate text-xs">{{ authHint() }}</p>
        </div>
        <RefreshCw
          v-if="authState.syncState === 'syncing'"
          :size="14"
          class="text-primary-light shrink-0 animate-spin"
        />
      </button>
    </div>
  </aside>
</template>
