<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Copy, ExternalLink, Globe, ScrollText, Star } from '@lucide/vue';
import { POLYMARKET_WEB_URL, type EventListItem } from '@polytrader/shared';
import ContextMenu, { type ContextMenuItem } from '@/shared/components/ContextMenu.vue';
import { writeClipboardText } from '@/shared/utils/clipboard';
import EventRulesDialog from './EventRulesDialog.vue';

const props = defineProps<{
  open: boolean;
  x: number;
  y: number;
  event: EventListItem | null;
  isInWatchlist: (eventId: string) => boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  close: [];
  'open-trading': [event: EventListItem];
  'toggle-watchlist': [id: string];
}>();

const { t } = useI18n();
const rulesDialogOpen = ref(false);
const rulesEventId = ref<string | null>(null);

const menuItems = computed<ContextMenuItem[]>(() => {
  const event = props.event;
  if (!event) return [];

  const listed = props.isInWatchlist(event.id);
  const polymarketUrl = getPolymarketEventUrl(event);
  return [
    {
      label: t('market.startTrading'),
      icon: ExternalLink,
      onSelect: () => emit('open-trading', event),
    },
    {
      label: t('market.openOnPolymarket'),
      icon: Globe,
      title: polymarketUrl,
      disabled: !polymarketUrl,
      onSelect: () => openOnPolymarket(event),
    },
    { separator: true },
    {
      label: t(listed ? 'market.removeFromWatchlist' : 'market.addToWatchlist'),
      icon: Star,
      title: t(listed ? 'market.removeFromWatchlist' : 'market.addToWatchlist'),
      danger: listed,
      onSelect: () => emit('toggle-watchlist', event.id),
    },
    { separator: true },
    {
      label: t('common.copy'),
      icon: Copy,
      children: [
        {
          label: t('market.eventTitle'),
          icon: Copy,
          title: event.title,
          disabled: !event.title,
          onSelect: () => copyText(event.title),
        },
        {
          label: 'Event ID',
          icon: Copy,
          title: event.id,
          disabled: !event.id,
          onSelect: () => copyText(event.id),
        },
        {
          label: 'Slug',
          icon: Copy,
          title: event.slug,
          disabled: !event.slug,
          onSelect: () => copyText(event.slug),
        },
      ],
    },
    { separator: true },
    {
      label: t('market.showRules'),
      icon: ScrollText,
      onSelect: () => openEventRules(event),
    },
  ];
});

async function copyText(value: string): Promise<void> {
  const text = value.trim();
  if (!text) return;
  await writeClipboardText(text);
}

function getPolymarketEventUrl(event: EventListItem): string {
  const slug = event.slug?.trim();
  if (!slug) return '';
  return `${POLYMARKET_WEB_URL}/event/${encodeURIComponent(slug)}`;
}

async function openOnPolymarket(event: EventListItem): Promise<void> {
  const url = getPolymarketEventUrl(event);
  if (!url) return;
  await window.api.browserNavigate(url);
}

function openEventRules(event: EventListItem): void {
  rulesEventId.value = event.id;
  rulesDialogOpen.value = true;
}
</script>

<template>
  <ContextMenu
    :open="open"
    :x="x"
    :y="y"
    :items="menuItems"
    @update:open="emit('update:open', $event)"
    @close="emit('close')"
  />
  <EventRulesDialog v-model:open="rulesDialogOpen" :event-id="rulesEventId" />
</template>
