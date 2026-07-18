<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  modelValue: string;
  placeholder: string;
  label: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const inputValue = ref(props.modelValue);

watch(
  () => props.modelValue,
  (value) => {
    inputValue.value = value;
  },
);

function normalizeUsdAmount(value: string): string {
  const numericValue = value.replace(/[^\d.]/g, '');
  const firstDotIndex = numericValue.indexOf('.');
  const singleDotValue =
    firstDotIndex === -1
      ? numericValue
      : `${numericValue.slice(0, firstDotIndex + 1)}${numericValue
          .slice(firstDotIndex + 1)
          .replaceAll('.', '')}`;
  const [integerPart, decimalPart = ''] = singleDotValue.split('.');
  if (!singleDotValue.includes('.')) return integerPart ?? '';
  const normalizedIntegerPart = integerPart || '0';
  return `${normalizedIntegerPart}.${decimalPart.slice(0, 2)}`;
}

function handleInput(event: Event): void {
  const target = event.target as HTMLInputElement;
  const value = normalizeUsdAmount(target.value);
  target.value = value;
  inputValue.value = value;
  emit('update:modelValue', value);
}

function handleBlur(): void {
  const value = inputValue.value.endsWith('.') ? inputValue.value.slice(0, -1) : inputValue.value;
  inputValue.value = value;
  emit('update:modelValue', value);
}
</script>

<template>
  <div class="relative w-28 shrink-0">
    <input
      :value="inputValue"
      type="text"
      inputmode="decimal"
      class="border-border bg-background text-text placeholder:text-muted focus:border-primary/70 h-8 w-full rounded-md border py-0 pr-2.5 pl-6 text-sm transition-colors outline-none"
      :placeholder="placeholder"
      :aria-label="label"
      @input="handleInput"
      @blur="handleBlur"
    />
    <span
      class="text-muted pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm"
      aria-hidden="true"
    >
      $
    </span>
  </div>
</template>
