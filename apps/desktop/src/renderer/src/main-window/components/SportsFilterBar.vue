<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { SportDisciplineCategory, SportLeagueCategory } from '@polytrader/shared';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';
import { handleHorizontalWheel } from '../../shared/utils/horizontalScroll';

const props = defineProps<{
  disciplines: SportDisciplineCategory[];
  leagues: SportLeagueCategory[];
  selectedDiscipline: string;
  selectedSport: string;
  loading?: boolean;
  error?: string;
}>();

const emit = defineEmits<{
  'select-discipline': [discipline: string];
  'select-sport': [sport: string];
}>();

const { t } = useI18n();

const allLabel = computed(() => t('sports.allSports'));
const allLeaguesLabel = computed(() => t('sports.allLeagues'));

function disciplineTitle(item: SportDisciplineCategory): string {
  return item.name || item.defaultName || item.code;
}

function leagueTitle(item: SportLeagueCategory): string {
  return item.name || item.defaultName || item.id;
}

function leagueLabel(item: SportLeagueCategory): string {
  return item.shortName || item.code;
}

function disciplineButtonClass(code: string): string {
  return props.selectedDiscipline === code
    ? 'border-primary/60 bg-primary/20 text-primary-light'
    : 'border-border bg-btn-secondary text-muted-light hover:bg-btn-secondary-hover hover:text-text';
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
      <div class="flex min-w-0 items-center gap-2" :aria-label="t('sports.discipline')">
        <span class="text-muted shrink-0 text-[13px]">{{ t('sports.discipline') }}</span>
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
            :aria-pressed="selectedDiscipline === ''"
            @click="emit('select-discipline', '')"
          >
            {{ allLabel }}
          </button>

          <button
            v-for="item in disciplines"
            :key="item.code"
            type="button"
            class="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border px-2.5 text-sm font-medium transition-colors"
            :class="disciplineButtonClass(item.code)"
            :title="disciplineTitle(item)"
            :aria-label="disciplineTitle(item)"
            :aria-pressed="selectedDiscipline === item.code"
            @click="emit('select-discipline', item.code)"
          >
            <span
              class="bg-bg relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
              aria-hidden="true"
            >
              <span>{{ disciplineTitle(item).slice(0, 1) }}</span>
              <img
                v-if="item.icon"
                :src="item.icon"
                :alt="disciplineTitle(item)"
                class="absolute inset-0 h-5 w-5 rounded-full object-cover"
                @error="hideBrokenIcon"
              />
            </span>
            {{ disciplineTitle(item) }}
          </button>
        </div>
      </div>

      <div
        v-if="selectedDiscipline"
        class="flex min-w-0 items-center gap-2"
        :aria-label="t('sports.league')"
      >
        <span class="text-muted shrink-0 text-[13px]">{{ t('sports.league') }}</span>
        <div
          class="scrollbar-hidden flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pr-2 whitespace-nowrap"
          @wheel="handleHorizontalWheel"
        >
          <button
            type="button"
            class="inline-flex h-8 shrink-0 items-center rounded-md border px-3 text-sm font-medium transition-colors"
            :class="buttonClass('')"
            :title="allLeaguesLabel"
            :aria-label="allLeaguesLabel"
            :aria-pressed="selectedSport === ''"
            @click="emit('select-sport', '')"
          >
            {{ allLeaguesLabel }}
          </button>

          <button
            v-for="item in leagues"
            :key="item.id"
            type="button"
            class="inline-flex h-8 shrink-0 items-center gap-2 rounded-md border px-2.5 text-sm transition-colors"
            :class="buttonClass(item.id)"
            :title="leagueTitle(item)"
            :aria-label="leagueTitle(item)"
            :aria-pressed="selectedSport === item.id"
            @click="emit('select-sport', item.id)"
          >
            <span
              class="bg-bg relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
              aria-hidden="true"
            >
              <span>{{ leagueLabel(item).slice(0, 1) }}</span>
              <img
                v-if="item.image"
                :src="item.image"
                :alt="leagueTitle(item)"
                class="absolute inset-0 h-5 w-5 rounded-full object-cover"
                @error="hideBrokenIcon"
              />
            </span>
            <span class="font-medium">{{ leagueLabel(item) }}</span>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
