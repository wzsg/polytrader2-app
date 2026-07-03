<script setup lang="ts">
defineProps<{
  title?: string;
  ariaLabel?: string;
}>();
</script>

<template>
  <header
    class="border-border bg-surface flex shrink-0 items-center justify-between gap-4 border-b px-6 py-4"
    :aria-label="ariaLabel || title"
  >
    <div class="flex min-w-0 flex-1 items-center">
      <slot>
        <h1 v-if="title" class="text-xl font-semibold text-white">{{ title }}</h1>
      </slot>
    </div>
    <slot name="actions" />
  </header>
</template>
