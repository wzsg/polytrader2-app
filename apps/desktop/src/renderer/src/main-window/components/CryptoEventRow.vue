<script setup lang="ts">
import { computed } from 'vue';
import { Star } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import type { EventListItem } from '@polytrader/shared';
import { formatDateTimeShort, formatNum } from '@/shared/utils/format';

const props = defineProps<{
  event: EventListItem;
  selected?: boolean;
  statusNowMs: number;
  timeframeDurationMinutes: number;
  isInWatchlist: boolean;
}>();

const emit = defineEmits<{
  'toggle-watchlist': [id: string];
  'open-detail': [event: EventListItem];
  'open-context-menu': [event: MouseEvent, item: EventListItem];
}>();

const { t } = useI18n();

function formatRemainingTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const paddedSeconds = String(seconds).padStart(2, '0');
  const paddedMinutes = String(minutes).padStart(2, '0');

  if (hours > 0) return `${hours}:${paddedMinutes}:${paddedSeconds}`;
  return `${paddedMinutes}:${paddedSeconds}`;
}

function getCryptoStatusInfo(): { label: string; class: string } {
  if (props.event.closed) {
    return { label: t('common.ended'), class: 'bg-danger/20 text-[#f08090]' };
  }

  if (!props.event.active || !props.event.end_date) {
    return { label: '', class: '' };
  }

  const endTimeMs = Date.parse(props.event.end_date);
  if (!Number.isFinite(endTimeMs)) return { label: '', class: '' };

  const remainingMs = endTimeMs - props.statusNowMs;
  if (remainingMs <= 0) {
    return { label: t('common.ended'), class: 'bg-danger/20 text-[#f08090]' };
  }
  if (
    props.timeframeDurationMinutes <= 0 ||
    remainingMs > props.timeframeDurationMinutes * 60_000
  ) {
    return { label: t('status.notStarted'), class: 'bg-primary/20 text-[#6b8cff]' };
  }

  return {
    label: formatRemainingTime(remainingMs),
    class: 'bg-emerald-500/15 text-emerald-300',
  };
}

const status = computed(() => getCryptoStatusInfo());

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
        v-if="status.label"
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
