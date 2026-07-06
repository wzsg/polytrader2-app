<script setup lang="ts">
import { computed, onMounted } from 'vue';
import type { EventListItem } from '@polytrader/shared';
import EventSearchBox from '../components/EventSearchBox.vue';
import SportsFilterBar from '../components/SportsFilterBar.vue';
import StatsBar from '../components/StatsBar.vue';
import SportsEventsTable from '../components/SportsEventsTable.vue';
import Pagination from '../../shared/components/Pagination.vue';
import { useSportsEvents } from '../../shared/composables/useSportsEvents';
import { useI18n } from 'vue-i18n';

defineProps<{
  selectedEventId?: string | null;
}>();

const emit = defineEmits<{
  'open-detail': [event: EventListItem];
  'open-trading': [event: EventListItem];
}>();

const sports = useSportsEvents();
const { t } = useI18n();

const canPrev = computed(() => sports.currentPage.value > 1);
const canNext = computed(() => sports.currentPage.value < sports.totalPages.value);

onMounted(() => sports.init());

function reload(): Promise<void> {
  sports.currentPage.value = 1;
  return sports.loadEvents();
}

defineExpose({ reload });
</script>

<template>
  <SportsFilterBar
    :sports="sports.availableSports.value"
    :selected-sport="sports.selectedSport.value"
    :loading="sports.metadataLoading.value"
    :error="sports.metadataError.value"
    @select-sport="sports.setSport"
  />

  <StatsBar
    variant="events"
    :total-count="sports.totalCount.value"
    :filtered-count="sports.filteredCount.value"
    :active-count="sports.activeCount.value"
  >
    <template #actions>
      <EventSearchBox :filters="sports.filters" />
    </template>
  </StatsBar>

  <div
    v-if="sports.error.value"
    class="border-border bg-surface border-b px-6 py-2 text-sm text-red-400"
  >
    {{ t('sports.loadEventsFailed', { error: sports.error.value }) }}
  </div>

  <SportsEventsTable
    :events="sports.pageEvents.value"
    :filters="sports.filters"
    :selected-event-id="selectedEventId"
    :is-in-watchlist="sports.isInWatchlist"
    @sort="sports.setSortField"
    @toggle-watchlist="sports.toggleWatchlist"
    @open-detail="emit('open-detail', $event)"
    @open-trading="emit('open-trading', $event)"
  />

  <Pagination
    :page-info="sports.pageInfo.value"
    :can-prev="canPrev"
    :can-next="canNext"
    @prev="sports.goPrevPage"
    @next="sports.goNextPage"
  />
</template>
