<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ChevronDown, ListFilter, RotateCcw } from '@lucide/vue';
import CryptoFilterBar from '../components/CryptoFilterBar.vue';
import CryptoAdvancedFilterBar from '../components/CryptoAdvancedFilterBar.vue';
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
const { t } = useI18n();
const filterPanelOpen = ref(false);

const CRYPTO_FILTER_STATE_KEYS = ['status', 'endDateMin', 'endDateMax'] as const;

const canPrev = computed(() => crypto.currentPage.value > 1);
const canNext = computed(() => crypto.currentPage.value < crypto.totalPages.value);
const hasActiveFilters = computed(() =>
  CRYPTO_FILTER_STATE_KEYS.some((key) => crypto.filters[key] !== crypto.defaultFilters[key]),
);
const filterButtonTitle = computed(() => {
  if (filterPanelOpen.value) return t('filter.collapse');
  return hasActiveFilters.value ? t('filter.expandActive') : t('filter.expand');
});

onMounted(() => crypto.init());

function toggleFilterPanel(): void {
  filterPanelOpen.value = !filterPanelOpen.value;
}

function reload(): Promise<void> {
  crypto.currentPage.value = 1;
  return crypto.loadEvents();
}

defineExpose({ reload });
</script>

<template>
  <CryptoFilterBar
    :filters="crypto.filters"
    :category="crypto.cryptoCategory.config.value"
    :loading="crypto.cryptoCategory.loading.value"
    :error="crypto.cryptoCategory.error.value"
  >
    <template #actions>
      <button
        type="button"
        class="inline-flex h-8 items-center justify-center gap-2 rounded-md border px-3 text-sm transition-colors"
        :class="
          hasActiveFilters
            ? 'border-primary/60 bg-primary/20 text-primary hover:bg-primary/25'
            : 'border-border bg-btn-secondary text-text hover:bg-btn-secondary-hover'
        "
        :title="filterButtonTitle"
        :aria-label="filterButtonTitle"
        aria-controls="crypto-list-filters"
        :aria-expanded="filterPanelOpen"
        @click="toggleFilterPanel"
      >
        <ListFilter :size="14" />
        {{ hasActiveFilters ? t('filter.active') : t('filter.inactive') }}
        <ChevronDown
          :size="14"
          class="transition-transform"
          :class="{ 'rotate-180': filterPanelOpen }"
        />
      </button>
    </template>
  </CryptoFilterBar>

  <CryptoAdvancedFilterBar
    v-if="filterPanelOpen"
    id="crypto-list-filters"
    :filters="crypto.filters"
  >
    <template #actions>
      <button
        type="button"
        class="border-border bg-btn-secondary text-text hover:bg-btn-secondary-hover inline-flex h-8 items-center justify-center gap-2 rounded-md border px-3 text-sm transition-colors"
        :title="t('filter.reset')"
        :aria-label="t('filter.reset')"
        @click="crypto.resetFilters"
      >
        <RotateCcw :size="14" />
        {{ t('common.reset') }}
      </button>
    </template>
  </CryptoAdvancedFilterBar>

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
