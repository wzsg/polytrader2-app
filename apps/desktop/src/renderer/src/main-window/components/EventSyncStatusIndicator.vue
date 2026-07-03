<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import LoadingSpinner from '../../shared/components/LoadingSpinner.vue';

const props = defineProps<{
  syncState?: string;
  syncStatus?: string;
}>();

const { t } = useI18n();

const isSyncing = computed(() => props.syncState === 'syncing');
const isError = computed(() => props.syncState === 'error');
const errorTitle = computed(() => props.syncStatus || t('sync.eventError'));
</script>

<template>
  <LoadingSpinner v-if="isSyncing" :size="16" :title="t('sync.eventSyncing')" />
  <span v-else-if="isError" class="text-danger text-xs font-medium" :title="errorTitle">
    {{ t('sync.eventError') }}
  </span>
</template>
