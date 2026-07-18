<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ChevronDown, ListFilter } from '@lucide/vue';
import type {
  PublicTraderLeaderboardCategory,
  PublicTraderLeaderboardEntry,
  PublicTraderLeaderboardOrderBy,
  PublicTraderLeaderboardTimePeriod,
} from '@polytrader/shared';
import AppHeader from '../components/AppHeader.vue';
import LeaderboardCategoryBar from '../components/LeaderboardCategoryBar.vue';
import LeaderboardFilterBar from '../components/LeaderboardFilterBar.vue';
import LeaderboardTable from '../components/LeaderboardTable.vue';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';
import Pagination from '../../shared/components/Pagination.vue';

const PAGE_SIZE = 50;

const { t } = useI18n();
const timePeriod = ref<PublicTraderLeaderboardTimePeriod>('MONTH');
const category = ref<PublicTraderLeaderboardCategory>('OVERALL');
const orderBy = ref<PublicTraderLeaderboardOrderBy>('PNL');
const offset = ref(0);
const entries = ref<PublicTraderLeaderboardEntry[]>([]);
const pending = ref(false);
const error = ref('');

const page = computed(() => Math.floor(offset.value / PAGE_SIZE) + 1);
const hasPreviousPage = computed(() => offset.value > 0);
const hasNextPage = computed(() => entries.value.length === PAGE_SIZE);
const pageInfo = computed(() => t('leaderboard.page', { page: page.value }));
const filterPanelOpen = ref(false);
const hasActiveFilters = computed(() => timePeriod.value !== 'MONTH');
const filterButtonTitle = computed(() => {
  if (filterPanelOpen.value) return t('filter.collapse');
  return hasActiveFilters.value ? t('filter.expandActive') : t('filter.expand');
});

async function loadLeaderboard(): Promise<void> {
  pending.value = true;
  error.value = '';
  try {
    const result = await window.api.getPublicTraderLeaderboard({
      timePeriod: timePeriod.value,
      category: category.value,
      orderBy: orderBy.value,
      limit: PAGE_SIZE,
      offset: offset.value,
    });
    if (!result.ok) {
      error.value = result.error;
      entries.value = [];
      return;
    }
    entries.value = result.data.entries;
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : String(loadError);
    entries.value = [];
  } finally {
    pending.value = false;
  }
}

function setTimePeriod(value: PublicTraderLeaderboardTimePeriod): void {
  timePeriod.value = value;
  offset.value = 0;
}

function setCategory(value: PublicTraderLeaderboardCategory): void {
  category.value = value;
  offset.value = 0;
}

function setOrderBy(value: PublicTraderLeaderboardOrderBy): void {
  if (orderBy.value === value) return;
  orderBy.value = value;
  offset.value = 0;
}

function toggleFilterPanel(): void {
  filterPanelOpen.value = !filterPanelOpen.value;
}

function previousPage(): void {
  offset.value = Math.max(0, offset.value - PAGE_SIZE);
}

function nextPage(): void {
  if (hasNextPage.value) offset.value += PAGE_SIZE;
}

async function openPublicTrader(entry: PublicTraderLeaderboardEntry): Promise<void> {
  try {
    await window.api.openPublicTraderWindow({ address: entry.proxyWallet });
  } catch (openError) {
    error.value = openError instanceof Error ? openError.message : String(openError);
  }
}

watch([timePeriod, category, orderBy, offset], () => {
  void loadLeaderboard();
});

onMounted(() => {
  void loadLeaderboard();
});
</script>

<template>
  <AppHeader :aria-label="t('leaderboard.title')">
    <LeaderboardCategoryBar :category="category" @update:category="setCategory" />
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
        aria-controls="leaderboard-filters"
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
  </AppHeader>

  <LeaderboardFilterBar
    v-if="filterPanelOpen"
    id="leaderboard-filters"
    :time-period="timePeriod"
    @update:time-period="setTimePeriod"
  />

  <div
    v-if="error"
    class="border-border bg-surface shrink-0 border-b px-6 py-2 text-sm text-red-400"
  >
    {{ error }}
  </div>

  <div v-if="pending" class="flex min-h-0 flex-1 items-center justify-center">
    <LoadingSpinner :size="20" :title="t('leaderboard.loadLeaderboard')" />
  </div>
  <LeaderboardTable
    v-else
    :entries="entries"
    :order-by="orderBy"
    @sort="setOrderBy"
    @open-trader="openPublicTrader"
  />

  <Pagination
    :page-info="pageInfo"
    :can-prev="hasPreviousPage"
    :can-next="hasNextPage"
    @prev="previousPage"
    @next="nextPage"
  />
</template>
