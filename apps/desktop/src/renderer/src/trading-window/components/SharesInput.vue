<script setup lang="ts">
import { computed, ref } from 'vue';
import { Minus, Plus } from '@lucide/vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const { t } = useI18n();

const focused = ref(false);
const placeholder = computed(() => (focused.value ? '' : '0'));

function handleInput(event: Event): void {
  const input = event.target as HTMLInputElement;
  const nextValue = normalizeInput(input.value);
  input.value = nextValue;
  emit('update:modelValue', nextValue);
}

function handleFocus(): void {
  focused.value = true;
}

function handleBlur(): void {
  focused.value = false;
  if (isZeroInput(props.modelValue)) clearInput();
}

function stepDown(): void {
  stepInput(-1);
}

function stepUp(): void {
  stepInput(1);
}

function stepInput(direction: 1 | -1): void {
  const currentValue = Number(props.modelValue) || 0;
  const nextValue = Math.max(0, currentValue + direction);
  if (nextValue <= 0) {
    clearInput();
    return;
  }
  emit('update:modelValue', formatSharesValue(nextValue));
}

function normalizeInput(value: string): string {
  const numericValue = value.replace(/[^\d.]/g, '');
  const firstDotIndex = numericValue.indexOf('.');
  if (firstDotIndex === -1) return numericValue;
  return `${numericValue.slice(0, firstDotIndex + 1)}${numericValue
    .slice(firstDotIndex + 1)
    .replaceAll('.', '')}`;
}

function formatSharesValue(value: number): string {
  return Number(value.toFixed(8)).toString();
}

function isZeroInput(value: string): boolean {
  if (!value || value === '.') return false;
  const numericValue = Number(value);
  return !Number.isNaN(numericValue) && numericValue === 0;
}

function clearInput(): void {
  emit('update:modelValue', '');
}
</script>

<template>
  <div class="mt-1 grid grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] gap-1">
    <button
      type="button"
      class="border-border bg-surface text-muted-light hover:bg-btn-secondary inline-flex h-9 items-center justify-center rounded-md border transition-colors hover:text-white"
      :title="t('common.decrease')"
      :aria-label="t('common.decrease')"
      @click="stepDown"
    >
      <Minus :size="14" />
    </button>
    <input
      :value="modelValue"
      type="text"
      inputmode="decimal"
      :placeholder="placeholder"
      class="border-border bg-surface text-text h-9 w-full rounded-md border px-3 text-center text-sm leading-9 tabular-nums outline-none"
      @input="handleInput"
      @focus="handleFocus"
      @blur="handleBlur"
    />
    <button
      type="button"
      class="border-border bg-surface text-muted-light hover:bg-btn-secondary inline-flex h-9 items-center justify-center rounded-md border transition-colors hover:text-white"
      :title="t('common.increase')"
      :aria-label="t('common.increase')"
      @click="stepUp"
    >
      <Plus :size="14" />
    </button>
  </div>
</template>
