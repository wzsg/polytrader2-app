import { onScopeDispose, ref } from 'vue';
import type { AppLocale } from '@polytrader/shared';
import type { EventCategoryConfig, EventCategoryItem } from '@polytrader/shared';
import { currentLocale } from '../i18n';

export interface EventCategoryFilter {
  tagIds: string[];
  excludeTagIds: string[];
}

function sortByOrder(items: EventCategoryItem[]): EventCategoryItem[] {
  return [...items].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

function normalizeCategoryLocale(locale: AppLocale): string {
  if (locale.startsWith('zh')) return 'zh';
  if (locale.startsWith('en')) return 'en';
  return locale.toLowerCase();
}

function matchesLocale(item: EventCategoryItem, locale: AppLocale): boolean {
  if (!Array.isArray(item.locale) || item.locale.length === 0) return true;
  const normalized = normalizeCategoryLocale(locale);
  return item.locale.some((value) => value.toLowerCase() === normalized);
}

function normalizeIds(ids: Array<string | number> | undefined): string[] {
  if (!Array.isArray(ids)) return [];
  return ids.map((id) => String(id)).filter(Boolean);
}

export function getAvailableEventCategories(
  config: EventCategoryConfig | null | undefined,
  locale: AppLocale = currentLocale.value,
): EventCategoryItem[] {
  if (!Array.isArray(config?.categories)) return [];
  return sortByOrder(
    config.categories.filter((item) => item.enabled !== false && matchesLocale(item, locale)),
  );
}

export function resolveEventCategoryFilter(
  config: EventCategoryConfig | null | undefined,
  slug: string,
  locale: AppLocale = currentLocale.value,
): EventCategoryFilter {
  const category = getAvailableEventCategories(config, locale).find((item) => item.slug === slug);
  if (!category) return { tagIds: [], excludeTagIds: [] };

  return {
    tagIds: normalizeIds(category.tagIds),
    excludeTagIds: normalizeIds(category.excludeTagIds),
  };
}

export function getEventCategoryLabel(
  category: EventCategoryItem,
  locale: AppLocale = currentLocale.value,
): string {
  const labels = category.labels ?? {};
  if (locale.startsWith('zh')) return labels.zh || labels.en || category.slug;
  return labels.en || labels.zh || category.slug;
}

export function validateEventCategorySlug(
  config: EventCategoryConfig | null | undefined,
  slug: string,
  locale: AppLocale = currentLocale.value,
): string {
  if (!slug) return '';
  return getAvailableEventCategories(config, locale).some((item) => item.slug === slug) ? slug : '';
}

export function useEventCategory() {
  const config = ref<EventCategoryConfig | null>(null);
  const loading = ref(false);
  const error = ref('');

  const unsubscribeCategoryConfigChanged = window.api.onCategoryConfigChanged((event) => {
    if (!event.scopes.includes('event')) return;
    void loadCategory({ force: true });
  });

  onScopeDispose(() => {
    unsubscribeCategoryConfigChanged();
  });

  async function loadCategory(options: { force?: boolean } = {}): Promise<EventCategoryConfig | null> {
    if (config.value && !options.force) return config.value;

    loading.value = true;
    error.value = '';
    try {
      config.value = await window.api.fetchEventCategory();
      return config.value;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      return null;
    } finally {
      loading.value = false;
    }
  }

  return {
    config,
    loading,
    error,
    loadCategory,
    getAvailableEventCategories,
    getEventCategoryLabel,
    resolveEventCategoryFilter,
    validateEventCategorySlug,
  };
}
