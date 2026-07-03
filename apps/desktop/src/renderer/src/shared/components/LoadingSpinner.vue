<script setup lang="ts">
import { computed } from 'vue';
import { LoaderCircle } from '@lucide/vue';
import { translateUiText } from '../i18n';

const props = withDefaults(
  defineProps<{
    size?: number;
    title?: string;
  }>(),
  {
    size: 15,
    title: 'Loading',
  },
);

const accessibleTitle = computed(() => translateUiText(props.title));
</script>

<template>
  <span
    class="text-muted-light inline-flex items-center justify-center"
    :title="accessibleTitle"
    role="status"
    :aria-label="accessibleTitle"
  >
    <LoaderCircle :size="size" class="animate-spin" />
  </span>
</template>
