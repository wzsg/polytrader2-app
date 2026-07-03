<script setup lang="ts">
import { RefreshCw } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';

withDefaults(
  defineProps<{
    title: string;
    loading?: boolean;
    error?: string;
    configured?: boolean;
    configHint?: string;
    emptyText?: string;
    itemCount?: number;
    showCount?: boolean;
    subtitle?: string;
    showRefresh?: boolean;
  }>(),
  {
    loading: false,
    error: '',
    configured: false,
    configHint: '',
    emptyText: '',
    itemCount: 0,
    showCount: false,
    subtitle: '',
    showRefresh: true,
  },
);

const emit = defineEmits<{
  refresh: [];
}>();

const { t } = useI18n();
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div
      class="border-border bg-surface flex shrink-0 items-center justify-between border-b px-6 py-4"
    >
      <div>
        <h1 class="text-lg font-semibold text-white">{{ title }}</h1>
        <p v-if="!configured" class="mt-1 text-sm text-amber-400">
          {{ configHint }}
        </p>
        <p v-else-if="error" class="mt-1 text-sm text-red-400">{{ error }}</p>
        <p v-else-if="subtitle" class="text-muted mt-1 text-sm">{{ subtitle }}</p>
        <p v-else-if="showCount" class="text-muted mt-1 text-sm">
          {{ t('count.items', { count: itemCount }) }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <slot name="actions" />
        <button
          v-if="showRefresh"
          type="button"
          class="border-border text-text inline-flex items-center gap-2 rounded-md border bg-[#1e1e35] px-3 py-2 text-sm transition-colors hover:bg-[#2a2a45] disabled:opacity-50"
          :disabled="loading || !configured"
          @click="emit('refresh')"
        >
          <RefreshCw :size="14" :class="{ 'animate-spin': loading }" />
          {{ t('common.refresh') }}
        </button>
      </div>
    </div>

    <div v-if="!configured" class="text-muted flex flex-1 items-center justify-center p-8 text-sm">
      {{ configHint || t('account.configureTradableHint', { title }) }}
    </div>

    <div
      v-else-if="loading && itemCount === 0"
      class="text-muted flex flex-1 items-center justify-center p-8 text-sm"
    >
      <LoadingSpinner :size="18" :title="t('common.loading')" />
    </div>

    <div
      v-else-if="itemCount === 0 && !error"
      class="text-muted flex flex-1 items-center justify-center p-8 text-sm"
    >
      {{ emptyText }}
    </div>

    <slot v-else />
  </div>
</template>
