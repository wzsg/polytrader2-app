<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { CircleAlert } from '@lucide/vue';
import type { EventCategoryConfig, EventCategoryItem } from '@polytrader/shared';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';
import {
  getAvailableEventCategories,
  getEventCategoryLabel,
} from '../../shared/composables/useEventCategory';
import { currentLocale } from '../../shared/i18n';
import { handleHorizontalWheel } from '../../shared/utils/horizontalScroll';

const props = defineProps<{
  category?: EventCategoryConfig | null;
  selectedSlug: string;
  loading?: boolean;
  error?: string;
}>();

const emit = defineEmits<{
  'update:selectedSlug': [slug: string];
}>();

const { t } = useI18n();

const categories = computed(() => getAvailableEventCategories(props.category, currentLocale.value));

function labelOf(category: EventCategoryItem): string {
  return getEventCategoryLabel(category, currentLocale.value);
}

function selectCategory(slug: string): void {
  emit('update:selectedSlug', slug);
}

function buttonClass(slug: string): string {
  return props.selectedSlug === slug
    ? 'border-primary/60 bg-primary/20 text-primary-light'
    : 'border-border bg-btn-secondary text-muted-light hover:bg-btn-secondary-hover hover:text-text';
}
</script>

<template>
  <div class="flex min-w-0 flex-1 items-center gap-2" :aria-label="t('category.event')">
    <div
      class="scrollbar-hidden flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pr-2 whitespace-nowrap"
      @wheel="handleHorizontalWheel"
    >
      <button
        type="button"
        class="inline-flex h-8 shrink-0 items-center rounded-md border px-3 text-sm transition-colors"
        :class="buttonClass('')"
        :title="t('category.all')"
        :aria-label="t('category.all')"
        @click="selectCategory('')"
      >
        {{ t('common.all') }}
      </button>

      <button
        v-for="item in categories"
        :key="item.slug"
        type="button"
        class="inline-flex h-8 shrink-0 items-center rounded-md border px-3 text-sm transition-colors"
        :class="buttonClass(item.slug)"
        :title="labelOf(item)"
        :aria-label="labelOf(item)"
        @click="selectCategory(item.slug)"
      >
        {{ labelOf(item) }}
      </button>
    </div>

    <LoadingSpinner v-if="loading" :size="16" :title="t('category.load')" />
    <span
      v-else-if="error"
      class="inline-flex h-8 w-8 shrink-0 items-center justify-center text-red-400"
      :title="t('category.loadFailed', { error })"
      role="status"
      :aria-label="t('category.loadFailed', { error })"
    >
      <CircleAlert :size="16" />
    </span>
  </div>
</template>
