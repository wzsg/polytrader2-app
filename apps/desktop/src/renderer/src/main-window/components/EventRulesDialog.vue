<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { X } from '@lucide/vue';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';
import { useEventDetail } from '@/shared/composables/useEventDetail';

const props = defineProps<{
  open: boolean;
  eventId?: string | null;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const { t } = useI18n();
const { event, loading, error, loadEvent, clearEvent } = useEventDetail();

const eventRules = computed(() => event.value?.description?.trim() || '');

watch(
  () => [props.open, props.eventId] as const,
  ([open, eventId]) => {
    if (!open) {
      clearEvent();
      return;
    }
    if (!eventId) return;
    void loadEvent(eventId);
  },
  { immediate: true },
);

function closeDialog(): void {
  emit('update:open', false);
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-rules-title"
      @click.self="closeDialog"
    >
      <div
        class="border-border bg-surface flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg border shadow-2xl shadow-black/40"
      >
        <header class="border-border flex shrink-0 items-center justify-between border-b px-5 py-4">
          <h2 id="event-rules-title" class="text-base font-semibold text-white">
            {{ t('market.rules') }}
          </h2>
          <button
            type="button"
            class="hover:bg-btn-secondary text-muted-light inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:text-white"
            :title="t('market.closeRules')"
            :aria-label="t('market.closeRules')"
            @click="closeDialog"
          >
            <X :size="16" />
          </button>
        </header>
        <div class="text-muted-light min-h-0 overflow-auto px-5 py-4 text-sm leading-relaxed">
          <div v-if="loading" class="flex min-h-24 items-center justify-center">
            <LoadingSpinner :size="18" :title="t('market.loadEventMarkets')" />
          </div>
          <p v-else-if="error" class="text-[#f08090]">{{ error }}</p>
          <p v-else-if="eventRules" class="whitespace-pre-wrap">{{ eventRules }}</p>
          <p v-else class="text-muted">{{ t('market.noRules') }}</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>
