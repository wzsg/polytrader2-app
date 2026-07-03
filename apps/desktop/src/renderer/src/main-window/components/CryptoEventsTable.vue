<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { EventListItem, Filters } from '@polytrader/shared';
import CryptoEventRow from './CryptoEventRow.vue';
import EventContextMenu from './EventContextMenu.vue';

const props = defineProps<{
  events: EventListItem[];
  filters: Pick<
    Filters,
    'sortField' | 'sortOrder' | 'cryptoCoin' | 'cryptoMarketMode' | 'cryptoTimeframe'
  >;
  selectedEventId?: string | null;
  isInWatchlist: (eventId: string) => boolean;
}>();

const emit = defineEmits<{
  sort: [field: string];
  'toggle-watchlist': [id: string];
  'open-detail': [event: EventListItem];
}>();

const { t } = useI18n();

const columns: Array<{ field: string; labelKey: string; align: string }> = [
  { field: 'title', labelKey: 'common.title', align: 'left' },
  { field: 'active', labelKey: 'common.status', align: 'left' },
  { field: 'end_date', labelKey: 'common.endedAt', align: 'right' },
  { field: 'volume24hr', labelKey: 'common.volume24h', align: 'right' },
  { field: 'volume', labelKey: 'common.volume', align: 'right' },
  { field: 'liquidity', labelKey: 'common.liquidity', align: 'right' },
  { field: 'market_count', labelKey: 'common.markets', align: 'right' },
];

const contextMenuOpen = ref(false);
const contextMenuX = ref(0);
const contextMenuY = ref(0);
const contextEvent = ref<EventListItem | null>(null);
const contextSelectedEventId = ref('');

function thClass(col: { field: string; align: string }): string {
  const align = col.align === 'right' ? 'text-right' : 'text-left';
  const sorted = props.filters.sortField === col.field;
  const sortIcon = sorted
    ? props.filters.sortOrder === 'asc'
      ? 'after:ml-1 after:text-[10px] after:text-primary after:content-["▲"]'
      : 'after:ml-1 after:text-[10px] after:text-primary after:content-["▼"]'
    : '';
  return `bg-surface cursor-pointer select-none border-b border-border px-4 py-2.5 text-xs font-semibold uppercase text-muted transition-colors hover:bg-[#22223a] hover:text-[#ccc] ${align} ${sortIcon}`;
}

function isSelected(event: EventListItem): boolean {
  const selectedEventId = String(props.selectedEventId || '');
  const eventId = String(event.id);
  return eventId === (contextSelectedEventId.value || selectedEventId);
}

function openContextMenu(mouseEvent: MouseEvent, event: EventListItem): void {
  contextEvent.value = event;
  contextSelectedEventId.value = String(event.id);
  contextMenuX.value = mouseEvent.clientX;
  contextMenuY.value = mouseEvent.clientY;
  contextMenuOpen.value = true;
}

function closeContextMenu(): void {
  contextEvent.value = null;
}

function handleOpenDetail(event: EventListItem): void {
  contextSelectedEventId.value = '';
  emit('open-detail', event);
}
</script>

<template>
  <div class="min-h-0 flex-1 overflow-auto">
    <table class="w-full border-collapse">
      <thead class="bg-surface sticky top-0 z-10">
        <tr>
          <th
            v-for="col in columns"
            :key="col.field"
            :class="thClass(col)"
            @click="emit('sort', col.field)"
          >
            {{ t(col.labelKey) }}
          </th>
          <th
            class="border-border bg-surface text-muted w-[76px] border-b px-4 py-2.5 text-center text-xs font-semibold whitespace-nowrap uppercase"
          >
            {{ t('nav.watchlist') }}
          </th>
        </tr>
      </thead>
      <tbody>
        <template v-for="event in events" :key="event.id">
          <CryptoEventRow
            :event="event"
            :selected="isSelected(event)"
            :is-in-watchlist="isInWatchlist(event.id)"
            @toggle-watchlist="emit('toggle-watchlist', $event)"
            @open-detail="handleOpenDetail"
            @open-context-menu="openContextMenu"
          />
        </template>
      </tbody>
    </table>

    <EventContextMenu
      v-model:open="contextMenuOpen"
      :x="contextMenuX"
      :y="contextMenuY"
      :event="contextEvent"
      :is-in-watchlist="isInWatchlist"
      @open-detail="handleOpenDetail"
      @toggle-watchlist="emit('toggle-watchlist', $event)"
      @close="closeContextMenu"
    />
  </div>
</template>
