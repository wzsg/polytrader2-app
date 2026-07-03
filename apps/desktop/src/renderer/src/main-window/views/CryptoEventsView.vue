<script setup lang="ts">
import { computed, onMounted } from 'vue';
import CryptoFilterBar from '../components/CryptoFilterBar.vue';
import StatsBar from '../components/StatsBar.vue';
import CryptoEventsTable from '../components/CryptoEventsTable.vue';
import EventSyncStatusIndicator from '../components/EventSyncStatusIndicator.vue';
import Pagination from '../../shared/components/Pagination.vue';
import { useCryptoEvents } from '../../shared/composables/useCryptoEvents';

import type { EventListItem } from '@polytrader/shared';

const emit = defineEmits<{
  'open-detail': [event: EventListItem];
}>();

defineProps<{
  selectedEventId?: string | null;
  syncState?: string;
  syncStatus?: string;
}>();

const crypto = useCryptoEvents();

const canPrev = computed(() => crypto.currentPage.value > 1);
const canNext = computed(() => crypto.currentPage.value < crypto.totalPages.value);

onMounted(() => crypto.init());
</script>

<template>
  <CryptoFilterBar
    :filters="crypto.filters"
    :category="crypto.cryptoCategory.config.value"
    :loading="crypto.cryptoCategory.loading.value"
    :error="crypto.cryptoCategory.error.value"
  />

  <StatsBar
    variant="events"
    :total-count="crypto.totalCount.value"
    :filtered-count="crypto.filteredCount.value"
    :active-count="crypto.activeCount.value"
  >
    <template #actions>
      <EventSyncStatusIndicator :sync-state="syncState" :sync-status="syncStatus" />
    </template>
  </StatsBar>

  <CryptoEventsTable
    :events="crypto.pageEvents.value"
    :filters="crypto.filters"
    :selected-event-id="selectedEventId"
    :is-in-watchlist="crypto.isInWatchlist"
    @sort="crypto.setSortField"
    @toggle-watchlist="crypto.toggleWatchlist"
    @open-detail="emit('open-detail', $event)"
  />

  <Pagination
    :page-info="crypto.pageInfo.value"
    :can-prev="canPrev"
    :can-next="canNext"
    @prev="crypto.goPrevPage"
    @next="crypto.goNextPage"
  />
</template>
