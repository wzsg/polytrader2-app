<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { SportsMetadataItem } from '@polytrader/shared';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';
import { sportCodeLabel } from '../../shared/composables/sportsMetadata';
import { handleHorizontalWheel } from '../../shared/utils/horizontalScroll';

const props = defineProps<{
  sports: SportsMetadataItem[];
  selectedSport: string;
  loading?: boolean;
  error?: string;
}>();

const emit = defineEmits<{
  'select-sport': [sport: string];
}>();

const { t } = useI18n();

const allLabel = computed(() => t('sports.allEsports'));

function sportTitle(item: SportsMetadataItem): string {
  return sportCodeLabel(item.sport);
}

function categoryTitle(item: SportsMetadataItem): string {
  return `${sportTitle(item)} (${item.activeEventCount ?? 0})`;
}

function buttonClass(sport: string): string {
  return props.selectedSport === sport
    ? 'border-primary/60 bg-primary/20 text-primary-light'
    : 'border-border bg-btn-secondary text-muted-light hover:bg-btn-secondary-hover hover:text-text';
}

function hideBrokenIcon(event: Event): void {
  const target = event.target;
  if (target instanceof HTMLImageElement) {
    target.style.display = 'none';
  }
}
</script>

<template>
  <div class="border-border bg-surface flex shrink-0 flex-col gap-3 border-b px-6 py-3.5">
    <template v-if="loading">
      <LoadingSpinner :size="16" :title="t('sports.loadMetadata')" />
    </template>

    <template v-else-if="error">
      <span class="text-sm text-red-400">{{ t('sports.loadMetadataFailed', { error }) }}</span>
    </template>

    <template v-else>
      <div class="flex min-w-0 items-center gap-2" :aria-label="t('sports.sportLabel')">
        <div
          class="scrollbar-hidden flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pr-2 whitespace-nowrap"
          @wheel="handleHorizontalWheel"
        >
          <button
            type="button"
            class="inline-flex h-9 shrink-0 items-center rounded-md border px-3 text-sm font-medium transition-colors"
            :class="buttonClass('')"
            :title="allLabel"
            :aria-label="allLabel"
            :aria-pressed="selectedSport === ''"
            @click="emit('select-sport', '')"
          >
            {{ allLabel }}
          </button>

          <button
            v-for="item in sports"
            :key="`${item.sport}-${item.series}`"
            type="button"
            class="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border px-2.5 text-sm transition-colors"
            :class="buttonClass(item.sport)"
            :title="categoryTitle(item)"
            :aria-label="categoryTitle(item)"
            :aria-pressed="selectedSport === item.sport"
            @click="emit('select-sport', item.sport)"
          >
            <span
              class="bg-bg relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
              aria-hidden="true"
            >
              <span>{{ sportTitle(item).slice(0, 1) }}</span>
              <img
                v-if="item.image"
                :src="item.image"
                :alt="sportTitle(item)"
                class="absolute inset-0 h-5 w-5 rounded-full object-cover"
                @error="hideBrokenIcon"
              />
            </span>
            <span class="font-medium">{{ sportTitle(item) }}</span>
            <span class="text-xs tabular-nums opacity-75">{{ item.activeEventCount ?? 0 }}</span>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
