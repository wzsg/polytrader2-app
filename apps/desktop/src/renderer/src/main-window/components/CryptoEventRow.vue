<script setup lang="ts">
import { Star } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import type { EventListItem } from '@polytrader/shared';
import { formatDateTimeShort, formatNum } from '@/shared/utils/format';
import { getStatusInfo } from '@/shared/utils/markets';

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
        <img
          v-if="event.image"
          :src="event.image"
          alt=""
          loading="lazy"
          class="h-6 w-6 shrink-0 rounded object-cover"
        />
        <span class="truncate">{{ event.title }}</span>
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
            ? 'text-watchlist hover:border-danger hover:text-watchlist-hover border-[#6b5a2d] bg-[rgba(255,193,7,0.12)] hover:bg-[rgba(230,57,70,0.15)]'
            : 'bg-btn-secondary text-primary-light hover:border-primary border-[#3a3a5e] hover:text-white'
        "
        :title="watchlistTitle()"
        :aria-label="watchlistTitle()"
        @click="onWatchlistClick"
      >
        <Star :size="14" :class="{ 'fill-current': isInWatchlist }" />
      </button>
    </td>
  </tr>
</template>
