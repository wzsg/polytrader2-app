<script setup lang="ts">
import { computed, onMounted } from 'vue';
import type { EventListItem } from '@polytrader/shared';
import EsportsFilterBar from '../components/EsportsFilterBar.vue';
import StatsBar from '../components/StatsBar.vue';
import SportsEventsTable from '../components/SportsEventsTable.vue';
import EventSyncStatusIndicator from '../components/EventSyncStatusIndicator.vue';
import Pagination from '../../shared/components/Pagination.vue';
import { useEsportsEvents } from '../../shared/composables/useEsportsEvents';
import { useI18n } from 'vue-i18n';

defineProps<{
  selectedEventId?: string | null;
  syncState?: string;
  syncStatus?: string;
}>();

const emit = defineEmits<{
  'open-detail': [event: EventListItem];
}>();

const esports = useEsportsEvents();
const { t } = useI18n();

const canPrev = computed(() => esports.currentPage.value > 1);
const canNext = computed(() => esports.currentPage.value < esports.totalPages.value);

onMounted(() => esports.init());

function reload(): Promise<void> {
  esports.currentPage.value = 1;
  return esports.loadEvents();
}

defineExpose({ reload });
</script>

<template>
  <EsportsFilterBar
    :sports="esports.availableSports.value"
    :selected-sport="esports.selectedSport.value"
    :loading="esports.metadataLoading.value"
    :error="esports.metadataError.value"
    @select-sport="esports.setSport"
  />

  <StatsBar
    variant="events"
    :total-count="esports.totalCount.value"
    :filtered-count="esports.filteredCount.value"
    :active-count="esports.activeCount.value"
  >
    <template #actions>
      <EventSyncStatusIndicator :sync-state="syncState" :sync-status="syncStatus" />
    </template>
  </StatsBar>

  <div
    v-if="esports.error.value"
    class="border-border bg-surface border-b px-6 py-2 text-sm text-red-400"
  >
    {{ t('sports.loadEventsFailed', { error: esports.error.value }) }}
  </div>

  <SportsEventsTable
    :events="esports.pageEvents.value"
    :filters="esports.filters"
    :selected-event-id="selectedEventId"
    :is-in-watchlist="esports.isInWatchlist"
    @sort="esports.setSortField"
    @toggle-watchlist="esports.toggleWatchlist"
    @open-detail="emit('open-detail', $event)"
  />

  <Pagination
    :page-info="esports.pageInfo.value"
    :can-prev="canPrev"
    :can-next="canNext"
    @prev="esports.goPrevPage"
    @next="esports.goNextPage"
  />
</template>
