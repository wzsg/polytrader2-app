<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowLeftToLine, ScrollText } from '@lucide/vue';
import type { ApiEvent, DbMarket, Market } from '@polytrader/shared';
import { getMarketOutcomes } from '@/shared/utils/apiEvent';
import { formatDate, formatNum, formatOutcomePrice } from '@/shared/utils/format';
import {
  displayMarkets,
  getMarketIcon,
  getMarketTitle,
  getStatusInfo,
} from '@/shared/utils/markets';
import { deriveChildEventShortTitle } from '@/shared/utils/teams';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';
import EventRulesDialog from './EventRulesDialog.vue';
import EventTeamTitle from './EventTeamTitle.vue';

const props = defineProps<{
  event?: ApiEvent | null;
  activeMarketId: string;
  loading?: boolean;
  error?: string;
  collapsible?: boolean;
}>();

const emit = defineEmits<{
  'select-market': [marketId: string, tokenId?: string | null, outcome?: string | null];
  collapse: [];
}>();

const { t } = useI18n();

const listRef = ref<HTMLElement | null>(null);
const itemRefs = ref(new Map<string, HTMLElement>());
const rulesDialogOpen = ref(false);

const markets = computed(() => (props.event ? displayMarkets(props.event.markets) : []));
const status = computed(() => (props.event ? getStatusInfo(props.event) : null));
const childEventShortTitle = computed(() =>
  props.event ? deriveChildEventShortTitle(props.event) : '',
);

function setItemRef(marketId: string, el: unknown): void {
  if (el instanceof HTMLElement) itemRefs.value.set(String(marketId), el);
  else itemRefs.value.delete(String(marketId));
}

function scrollActiveIntoView() {
  nextTick(() => {
    const el = itemRefs.value.get(String(props.activeMarketId));
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

watch(
  () => props.activeMarketId,
  () => scrollActiveIntoView(),
  { immediate: true },
);

watch(
  () => props.event?.id,
  () => {
    rulesDialogOpen.value = false;
    scrollActiveIntoView();
  },
);

function outcomeClass(label: string): string {
  const lower = label.toLowerCase();
  if (lower === 'yes') {
    return 'border-[#2d6a4f] bg-[#244738] text-[#9ce0b8] hover:bg-[#2b5946]';
  }
  if (lower === 'no') {
    return 'border-[#6a2d3d] bg-[#442431] text-[#f0a0a8] hover:bg-[#57303e]';
  }
  return 'border-[#3a4a7a] bg-[#263152] text-[#b9c8ff] hover:bg-[#303e68]';
}

function outcomePriceLabel(price: unknown): string {
  return price == null ? '-' : formatOutcomePrice(price);
}

function marketStatusClass(market: DbMarket | Market): string {
  return market.closed ? 'bg-[#ef4444]' : 'bg-[#22c55e]';
}

function marketStatusTitle(market: DbMarket | Market): string {
  return market.closed ? t('status.closed') : t('status.active');
}

function selectMarketOutcome(
  market: DbMarket | Market,
  outcome: { tokenId: string; label: string },
): void {
  emit('select-market', market.id, outcome.tokenId || null, outcome.label);
}
</script>

<template>
  <aside class="border-border bg-sidebar flex h-full w-full min-w-0 flex-col border-l">
    <div class="border-border shrink-0 border-b px-4 py-3">
      <div v-if="event" class="flex min-w-0 items-center gap-2.5">
        <template v-if="!event.teams.length">
          <img
            v-if="event.icon || event.image"
            :src="event.icon || event.image"
            alt=""
            class="h-9 w-9 shrink-0 rounded-md object-cover"
          />
          <span v-else class="bg-btn-secondary block h-9 w-9 shrink-0 rounded-md" />
        </template>

        <div class="min-w-0 flex-1">
          <div
            v-if="childEventShortTitle"
            class="mb-1 truncate text-sm font-semibold text-white"
            :title="childEventShortTitle"
          >
            {{ childEventShortTitle }}
          </div>
          <h2
            v-if="event.teams.length"
            class="text-xs leading-snug font-semibold break-words whitespace-normal text-white"
          >
            <EventTeamTitle :teams="event.teams" logo-size="md" />
          </h2>
          <h2
            v-else
            class="text-sm leading-snug font-semibold break-words whitespace-normal text-white"
          >
            {{ event.title }}
          </h2>
          <div class="text-muted mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
            <span v-if="status" class="rounded px-1.5 py-0.5 font-semibold" :class="status.class">
              {{ status.label }}
            </span>
            <span v-if="event.end_date">
              {{ t('market.endAt', { date: formatDate(event.end_date) }) }}
            </span>
          </div>
        </div>
        <button
          v-if="collapsible"
          type="button"
          class="hover:bg-btn-secondary text-muted-light -mt-1 -mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:text-white"
          :title="t('common.collapse')"
          @click="emit('collapse')"
        >
          <ArrowLeftToLine :size="16" />
        </button>
      </div>
      <div v-else-if="loading">
        <LoadingSpinner :title="t('market.loadEventMarkets')" />
      </div>
    </div>

    <div v-if="error" class="px-4 py-3 text-xs text-[#f08090]">{{ error }}</div>

    <div
      v-else-if="loading"
      class="text-muted flex flex-1 items-center justify-center px-4 text-xs"
    >
      <LoadingSpinner :size="18" :title="t('market.loadMarketList')" />
    </div>

    <div
      v-else-if="!markets.length"
      class="text-muted flex flex-1 items-center justify-center px-4 text-center text-xs"
    >
      {{ t('market.noActiveMarkets') }}
    </div>

    <div v-else ref="listRef" class="min-h-0 flex-1 overflow-auto py-2">
      <article
        v-for="market in markets"
        :key="market.id"
        :ref="(el) => setItemRef(market.id, el)"
        class="border-l-2 transition-colors"
        :class="
          String(market.id) === String(activeMarketId)
            ? 'border-primary bg-primary/15 hover:bg-primary/20'
            : 'border-transparent hover:bg-[#1e1e35]'
        "
      >
        <button
          type="button"
          class="flex w-full cursor-pointer items-start gap-2.5 px-3 pt-2.5 text-left"
          @click="emit('select-market', market.id)"
        >
          <span
            class="relative mt-0.5 h-7 w-7 shrink-0"
            :title="marketStatusTitle(market)"
            :aria-label="marketStatusTitle(market)"
          >
            <img
              v-if="getMarketIcon(market, event ?? {})"
              :src="getMarketIcon(market, event ?? {})"
              alt=""
              class="h-7 w-7 rounded-md object-cover"
            />
            <span v-else class="bg-btn-secondary block h-7 w-7 rounded-md" />
            <span
              class="border-sidebar absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2"
              :class="marketStatusClass(market)"
              :title="marketStatusTitle(market)"
              :aria-label="marketStatusTitle(market)"
            />
          </span>

          <div class="min-w-0 flex-1">
            <div
              class="text-[13px] leading-snug break-words whitespace-normal"
              :class="String(market.id) === String(activeMarketId) ? 'text-white' : 'text-[#ccc]'"
              :title="getMarketTitle(market)"
            >
              {{ getMarketTitle(market) }}
            </div>
            <div class="text-muted mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] tabular-nums">
              <span>{{ t('market.volumeValue', { value: formatNum(market.volume) }) }}</span>
              <span>24h {{ formatNum(market.volume24hr) }}</span>
              <span>{{ t('market.liquidityValue', { value: formatNum(market.liquidity) }) }}</span>
            </div>
          </div>
        </button>

        <div class="flex flex-wrap gap-1.5 pr-3 pb-2.5 pl-[50px]">
          <button
            v-for="outcome in getMarketOutcomes(market)"
            :key="`${market.id}-${outcome.label}-${outcome.tokenId}`"
            type="button"
            class="inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors"
            :class="outcomeClass(outcome.label)"
            :title="`${outcome.label} ${outcomePriceLabel(outcome.price)}`"
            @click="selectMarketOutcome(market, outcome)"
          >
            <span class="truncate">{{ outcome.label }}</span>
            <span class="rounded bg-black/20 px-1.5 py-0.5 tabular-nums">
              {{ outcomePriceLabel(outcome.price) }}
            </span>
          </button>
        </div>
      </article>
    </div>

    <div
      v-if="markets.length"
      class="border-border text-muted flex shrink-0 items-center justify-between border-t px-4 py-2 text-[11px]"
    >
      <span>{{ t('market.countMarkets', { count: markets.length }) }}</span>
      <button
        type="button"
        class="text-muted-light hover:bg-btn-secondary hover:text-text inline-flex h-7 items-center gap-1.5 rounded-md px-2 transition-colors"
        :title="t('market.viewRules')"
        :aria-label="t('market.viewRules')"
        @click="rulesDialogOpen = true"
      >
        <ScrollText :size="13" />
        {{ t('market.rules') }}
      </button>
    </div>

    <EventRulesDialog v-model:open="rulesDialogOpen" :event-id="event?.id" />
  </aside>
</template>
