<script setup lang="ts">
import { CircleHelp } from '@lucide/vue';
import type { EventTeam } from '@polytrader/shared';

defineProps<{
  teams: EventTeam[];
  logoSize?: 'sm' | 'md';
}>();

function logoClass(size?: 'sm' | 'md'): string {
  return size === 'md'
    ? 'h-5 w-5 shrink-0 rounded-sm object-cover'
    : 'h-5 w-5 shrink-0 rounded-sm object-cover';
}
</script>

<template>
  <span class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
    <span
      v-for="(team, index) in teams.slice(0, 2)"
      :key="team.name"
      class="inline-flex min-w-0 items-center gap-1.5"
    >
      <span v-if="index > 0" class="text-muted shrink-0 text-[11px] font-medium" aria-hidden="true">
        vs.
      </span>
      <img
        v-if="team.logo"
        :src="team.logo"
        :alt="team.name"
        loading="lazy"
        :class="logoClass(logoSize)"
      />
      <CircleHelp v-else :size="20" class="text-muted shrink-0" aria-hidden="true" />
      <span class="truncate">{{ team.name }}</span>
    </span>
  </span>
</template>
