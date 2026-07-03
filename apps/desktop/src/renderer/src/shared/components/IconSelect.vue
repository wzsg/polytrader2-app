<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { Check, ChevronDown } from '@lucide/vue';

interface IconSelectOption {
  value: string;
  label: string;
  iconUrl?: string;
  disabled?: boolean;
}

const props = withDefaults(
  defineProps<{
    modelValue: string;
    options: IconSelectOption[];
    label?: string;
    placeholder?: string;
    disabled?: boolean;
  }>(),
  {
    label: '',
    placeholder: '',
    disabled: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const rootEl = ref<HTMLElement | null>(null);
const buttonEl = ref<HTMLButtonElement | null>(null);
const open = ref(false);

const selectedOption = computed(
  () => props.options.find((option) => option.value === props.modelValue) ?? null,
);

const disabled = computed(() => props.disabled || props.options.length === 0);

const displayLabel = computed(() => selectedOption.value?.label ?? props.placeholder);

function toggleOpen(): void {
  if (disabled.value) return;
  open.value = !open.value;
}

function closeMenu(): void {
  open.value = false;
}

function selectOption(option: IconSelectOption): void {
  if (option.disabled) return;
  emit('update:modelValue', option.value);
  closeMenu();
  buttonEl.value?.focus();
}

function handleDocumentPointerDown(event: PointerEvent): void {
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (rootEl.value?.contains(target)) return;
  closeMenu();
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  closeMenu();
  buttonEl.value?.focus();
}

watch(
  () => disabled.value,
  (nextDisabled) => {
    if (nextDisabled) closeMenu();
  },
);

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown, true);
  document.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
  document.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div ref="rootEl" class="relative block min-w-0">
    <span v-if="label" class="text-muted-light mb-1 block text-xs">{{ label }}</span>
    <button
      ref="buttonEl"
      type="button"
      class="border-border bg-bg text-text focus:border-primary flex h-9 w-full items-center justify-between gap-2 rounded-md border px-2.5 text-sm transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-60"
      :disabled="disabled"
      :aria-expanded="open"
      aria-haspopup="listbox"
      :title="label || displayLabel"
      @click="toggleOpen"
    >
      <span class="flex min-w-0 flex-1 items-center gap-2">
        <img
          v-if="selectedOption?.iconUrl"
          :src="selectedOption.iconUrl"
          class="h-5 w-5 shrink-0 rounded-full"
          :alt="selectedOption.label"
        />
        <span v-else class="border-border h-5 w-5 shrink-0 rounded-full border" />
        <span class="min-w-0 truncate text-left">{{ displayLabel }}</span>
      </span>
      <ChevronDown :size="15" class="text-muted-light shrink-0" />
    </button>

    <div
      v-if="open"
      class="border-border bg-detail-bg absolute z-40 mt-1 max-h-56 w-full overflow-auto rounded-md border py-1 shadow-xl"
      role="listbox"
    >
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        class="hover:bg-btn-secondary focus:bg-btn-secondary flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-sm transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-45"
        :class="option.value === modelValue ? 'bg-btn-secondary-hover' : 'bg-transparent'"
        :disabled="option.disabled"
        :aria-selected="option.value === modelValue"
        role="option"
        @click="selectOption(option)"
      >
        <span class="flex min-w-0 items-center gap-2">
          <img
            v-if="option.iconUrl"
            :src="option.iconUrl"
            class="h-5 w-5 shrink-0 rounded-full"
            :alt="option.label"
          />
          <span v-else class="border-border h-5 w-5 shrink-0 rounded-full border" />
          <span class="min-w-0 truncate text-white">{{ option.label }}</span>
        </span>
        <Check v-if="option.value === modelValue" :size="14" class="text-primary-light shrink-0" />
      </button>
    </div>
  </div>
</template>
