<script setup lang="ts">
import { computed } from 'vue';
import { Star } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import type { EventListItem } from '@polytrader/shared';
import { formatDateTimeShort, formatNum } from '@/shared/utils/format';
import { getStatusInfo } from '@/shared/utils/markets';
import { parseEventTeams } from '@/shared/utils/teams';
import EventTeamTitle from './EventTeamTitle.vue';

const props = defineProps<{
  event: EventListItem;
  selected?: boolean;
  isInWatchlist: boolean;
}>();

const emit = defineEmits<{
  'toggle-watchlist': [id: string];
  'open-detail': [event: EventListItem];
  'open-context-menu': [event: MouseEvent, item: EventListItem];
}>();

const { t } = useI18n();

const status = getStatusInfo(props.event);
const teams = computed(() => parseEventTeams(props.event.teams));

function watchlistTitle(): string {
  return t(props.isInWatchlist ? 'market.removeFromWatchlist' : 'market.addToWatchlist');
}

function onRowClick(): void {
  emit('open-detail', props.event);
}

function onWatchlistClick(e: MouseEvent): void {
  e.stopPropagation();
  emit('toggle-watchlist', props.event.id);
}

function onContextMenu(event: MouseEvent): void {
  emit('open-context-menu', event, props.event);
}
</script>

<template>
  <tr
    class="cursor-pointer transition-colors"
    :class="selected ? 'bg-primary/10 hover:bg-primary/15' : 'hover:bg-surface'"
    @click="onRowClick"
    @contextmenu.prevent="onContextMenu"
  >
    <td class="border-border-light max-w-[360px] border-b px-4 py-2.5 text-sm">
      <div class="flex min-w-0 items-center gap-2">
        <EventTeamTitle v-if="teams.length" :teams="teams" />
        <img
          v-else-if="event.image"
          :src="event.image"
          alt=""
          loading="lazy"
          class="h-6 w-6 shrink-0 rounded object-cover"
        />
        <span v-if="!teams.length" class="truncate">{{ event.title }}</span>
      </div>
    </td>
    <td class="border-border-light border-b px-4 py-2.5 text-sm whitespace-nowrap">
      <span
        class="inline-block rounded px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase"
        :class="status.class"
      >
        {{ status.label }}
      </span>
    </td>
    <td
      class="border-border-light text-muted-light border-b px-4 py-2.5 text-right text-[13px] whitespace-nowrap tabular-nums"
    >
      {{ formatDateTimeShort(event.end_date) }}
    </td>
    <td class="border-border-light border-b px-4 py-2.5 text-right text-sm tabular-nums">
      {{ formatNum(event.volume24hr) }}
    </td>
    <td class="border-border-light border-b px-4 py-2.5 text-right text-sm tabular-nums">
      {{ formatNum(event.volume) }}
    </td>
    <td class="border-border-light border-b px-4 py-2.5 text-right text-sm tabular-nums">
      {{ formatNum(event.liquidity) }}
    </td>
    <td class="border-border-light border-b px-4 py-2.5 text-right text-sm tabular-nums">
      {{ event.market_count ?? 0 }}
    </td>
    <td class="border-border-light w-[76px] border-b px-4 py-2.5 text-center">
      <button
        type="button"
        class="inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors"
        :class="
          isInWatchlist
            ? 'border-yellow-500/60 bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/25'
            : 'border-border bg-btn-secondary text-muted-light hover:bg-btn-secondary-hover hover:text-white'
        "
        :title="watchlistTitle()"
        :aria-label="watchlistTitle()"
        @click="onWatchlistClick"
      >
        <Star :size="15" :fill="isInWatchlist ? 'currentColor' : 'none'" />
      </button>
    </td>
  </tr>
</template>
