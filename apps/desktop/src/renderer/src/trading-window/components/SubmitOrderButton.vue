<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ChevronRight, Loader2, Send } from '@lucide/vue';

const props = withDefaults(
  defineProps<{
    label: string;
    slideLabel: string;
    slideReadyLabel: string;
    title: string;
    loading?: boolean;
    disabled?: boolean;
    antiMistouchEnabled?: boolean;
  }>(),
  {
    loading: false,
    disabled: false,
    antiMistouchEnabled: false,
  },
);

const emit = defineEmits<{
  submit: [];
}>();

const trackElement = ref<HTMLElement | null>(null);
const dragging = ref(false);
const progress = ref(0);

const SLIDER_START_ZONE_PX = 48;

const blocked = computed(() => props.disabled || props.loading);
const slideReady = computed(() => progress.value >= 0.92);
const progressPercent = computed(() => `${Math.round(progress.value * 100)}%`);
const sliderLabel = computed(() => (slideReady.value ? props.slideReadyLabel : props.slideLabel));

watch(
  () => [props.disabled, props.loading, props.antiMistouchEnabled] as const,
  () => {
    if (!props.loading) resetSlider();
  },
);

function submit(): void {
  if (blocked.value) return;
  emit('submit');
}

function startSlide(event: PointerEvent): void {
  if (blocked.value) return;
  const track = trackElement.value;
  if (!track) return;
  const rect = track.getBoundingClientRect();
  if (event.clientX - rect.left > SLIDER_START_ZONE_PX) return;
  dragging.value = true;
  progress.value = 0;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function updateProgress(event: PointerEvent): void {
  if (!dragging.value || blocked.value) return;
  const track = trackElement.value;
  if (!track) return;
  const rect = track.getBoundingClientRect();
  const nextProgress = (event.clientX - rect.left) / rect.width;
  progress.value = clampProgress(nextProgress);
}

function finishSlide(): void {
  if (!dragging.value) return;
  dragging.value = false;
  if (progress.value >= 0.92) {
    progress.value = 1;
    submit();
    return;
  }
  resetSlider();
}

function cancelSlide(): void {
  dragging.value = false;
  resetSlider();
}

function advanceKeyboardSlide(): void {
  if (blocked.value) return;
  const nextProgress = clampProgress(progress.value + 0.18);
  progress.value = nextProgress;
  if (nextProgress >= 0.92) {
    progress.value = 1;
    submit();
  }
}

function resetSlider(): void {
  dragging.value = false;
  progress.value = 0;
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
</script>

<template>
  <button
    v-if="!antiMistouchEnabled"
    type="button"
    class="bg-primary hover:bg-primary-hover inline-flex h-11 w-full items-center justify-center gap-2 rounded-md px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
    :disabled="blocked"
    :title="title"
    @click="submit"
  >
    <Loader2 v-if="loading" :size="16" class="animate-spin" />
    <Send v-else :size="16" />
    {{ label }}
  </button>

  <div
    v-else
    ref="trackElement"
    role="button"
    tabindex="0"
    class="border-border bg-surface relative h-11 w-full overflow-hidden rounded-md border text-sm font-medium transition-opacity outline-none select-none focus-visible:ring-2 focus-visible:ring-sky-400/70"
    :class="blocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'"
    :aria-disabled="blocked"
    :title="title"
    @pointerdown.prevent="startSlide"
    @pointermove.prevent="updateProgress"
    @pointerup.prevent="finishSlide"
    @pointercancel.prevent="cancelSlide"
    @keydown.right.prevent="advanceKeyboardSlide"
    @keydown.enter.prevent="advanceKeyboardSlide"
    @keydown.space.prevent="advanceKeyboardSlide"
  >
    <div
      class="absolute inset-y-0 left-0 transition-[width,background-color]"
      :class="[
        dragging ? 'duration-0' : 'duration-200',
        slideReady ? 'bg-emerald-500/45' : 'bg-primary/30',
      ]"
      :style="{ width: progressPercent }"
    ></div>
    <div
      class="pointer-events-none absolute inset-0 flex items-center justify-center leading-none transition-colors"
      :class="slideReady ? 'text-emerald-100' : 'text-text'"
    >
      <Loader2 v-if="loading" :size="16" class="mr-2 animate-spin" />
      <span>{{ loading ? label : sliderLabel }}</span>
    </div>
    <div
      class="absolute top-1/2 flex h-9 w-9 items-center justify-center rounded-md text-white shadow-sm transition-[left,transform,background-color]"
      :class="[
        dragging ? 'duration-0' : 'duration-200',
        slideReady ? 'bg-emerald-500' : 'bg-primary',
      ]"
      :style="{
        left: progressPercent,
        transform: `translateX(-${progressPercent}) translateY(-50%)`,
      }"
    >
      <ChevronRight :size="18" />
    </div>
  </div>
</template>
