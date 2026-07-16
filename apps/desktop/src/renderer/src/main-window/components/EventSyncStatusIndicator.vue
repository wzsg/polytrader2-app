<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import LoadingSpinner from '../../shared/components/LoadingSpinner.vue';

const props = defineProps<{
  eventSyncState?: string;
  eventSyncStatus?: string;
}>();

const { t } = useI18n();

const isSyncing = computed(() => props.eventSyncState === 'syncing');
const isError = computed(() => props.eventSyncState === 'error');
const errorTitle = computed(() => props.eventSyncStatus || t('eventSync.error'));
</script>

<template>
  <LoadingSpinner v-if="isSyncing" :size="16" :title="t('eventSync.syncEventData')" />
  <span v-else-if="isError" class="text-danger text-xs font-medium" :title="errorTitle">
    {{ t('eventSync.error') }}
  </span>
</template>
