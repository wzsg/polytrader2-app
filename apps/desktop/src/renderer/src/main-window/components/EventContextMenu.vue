<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Copy, ExternalLink, ScrollText, Star } from '@lucide/vue';
import type { EventListItem } from '@polytrader/shared';
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
  'open-detail': [event: EventListItem];
  'toggle-watchlist': [id: string];
}>();

const { t } = useI18n();
const rulesDialogOpen = ref(false);
const rulesEventId = ref<string | null>(null);

const menuItems = computed<ContextMenuItem[]>(() => {
  const event = props.event;
  if (!event) return [];

  const listed = props.isInWatchlist(event.id);
  return [
    {
      label: t('market.openDetail'),
      icon: ExternalLink,
      onSelect: () => emit('open-detail', event),
    },
    {
      label: t('market.viewRules'),
      icon: ScrollText,
      onSelect: () => openEventRules(event),
    },
    {
      label: t(listed ? 'market.removeFromWatchlist' : 'market.addToWatchlist'),
      icon: Star,
      title: t(listed ? 'market.removeFromWatchlist' : 'market.addToWatchlist'),
      danger: listed,
      onSelect: () => emit('toggle-watchlist', event.id),
    },
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
  ];
});

async function copyText(value: string): Promise<void> {
  const text = value.trim();
  if (!text) return;
  await writeClipboardText(text);
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
