<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Minus, Plus } from '@lucide/vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  modelValue: string;
  tickSize?: number | string | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const { t } = useI18n();

const inputValue = ref('');
const focused = ref(false);
const digits = computed(() => {
  const tickSize = Number(props.tickSize);
  if (tickSize === 0.0001) return 2;
  if (tickSize === 0.001) return 1;
  return 0;
});
const inputMode = computed(() => (digits.value === 0 ? 'numeric' : 'decimal'));
const placeholder = computed(() => {
  if (digits.value === 0) return '0';
  if (digits.value === 1) return '0.0';
  return '0.00';
});
const activePlaceholder = computed(() => (focused.value ? '' : placeholder.value));
const stepValue = computed(() => {
  if (digits.value === 0) return 1;
  if (digits.value === 1) return 0.1;
  return 0.01;
});
const maxCents = computed(() => 100 - stepValue.value);
const displayText = computed(() => inputValue.value || activePlaceholder.value);
const showCentsSuffix = computed(() => displayText.value || focused.value);

watch(
  () => [props.modelValue, props.tickSize] as const,
  () => {
    if (focused.value) return;
    inputValue.value = formatPriceAsCents(props.modelValue);
  },
  { immediate: true },
);

function handleInput(event: Event): void {
  const input = event.target as HTMLInputElement;
  const nextValue = normalizeInput(input.value);
  input.value = nextValue;
  inputValue.value = nextValue;
  updatePrice(nextValue);
}

function handleFocus(): void {
  focused.value = true;
}

function handleBlur(): void {
  focused.value = false;
  if (isZeroInput(inputValue.value)) {
    clearInput();
    return;
  }
  inputValue.value = formatPriceAsCents(props.modelValue);
}

function stepDown(): void {
  stepInput(-1);
}

function stepUp(): void {
  stepInput(1);
}

function stepInput(direction: 1 | -1): void {
  const currentCents = Number(inputValue.value) || 0;
  const nextCents = Math.min(
    maxCents.value,
    Math.max(0, currentCents + direction * stepValue.value),
  );
  if (nextCents <= 0) {
    clearInput();
    return;
  }
  const nextValue = formatCentsValue(nextCents);
  inputValue.value = nextValue;
  updatePrice(nextValue);
}

function formatPriceAsCents(value: string): string {
  if (!value) return '';
  const numericPrice = Number(value);
  if (Number.isNaN(numericPrice)) return '';
  return formatCentsValue(Math.min(maxCents.value, numericPrice * 100));
}

function normalizeInput(value: string): string {
  const numericValue = value.replace(/[^\d.]/g, '');
  const firstDotIndex = numericValue.indexOf('.');
  const singleDotValue =
    firstDotIndex === -1
      ? numericValue
      : `${numericValue.slice(0, firstDotIndex + 1)}${numericValue
          .slice(firstDotIndex + 1)
          .replaceAll('.', '')}`;

  if (digits.value === 0) return singleDotValue.split('.')[0] ?? '';

  const [integerPart, decimalPart = ''] = singleDotValue.split('.');
  if (!singleDotValue.includes('.')) return integerPart ?? '';
  return `${integerPart ?? ''}.${decimalPart.slice(0, digits.value)}`;
}

function updatePrice(value: string): void {
  if (!value || value === '.') {
    emit('update:modelValue', '');
    return;
  }
  const numericCents = Number(value);
  if (Number.isNaN(numericCents)) return;
  if (numericCents > maxCents.value) {
    const nextValue = formatCentsValue(maxCents.value);
    inputValue.value = nextValue;
    emit('update:modelValue', (maxCents.value / 100).toString());
    return;
  }
  emit('update:modelValue', (numericCents / 100).toString());
}

function formatCentsValue(value: number): string {
  return Number(value.toFixed(digits.value)).toString();
}

function isZeroInput(value: string): boolean {
  if (!value || value === '.') return false;
  const numericValue = Number(value);
  return !Number.isNaN(numericValue) && numericValue === 0;
}

function clearInput(): void {
  inputValue.value = '';
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
    <div class="relative min-w-0">
      <input
        :value="inputValue"
        type="text"
        :inputmode="inputMode"
        :placeholder="activePlaceholder"
        class="border-border bg-surface text-text h-9 w-full rounded-md border px-3 text-center text-sm leading-9 tabular-nums outline-none"
        @input="handleInput"
        @focus="handleFocus"
        @blur="handleBlur"
      />
      <span
        v-if="showCentsSuffix"
        class="pointer-events-none absolute inset-0 inline-flex items-center justify-center text-sm leading-9 tabular-nums"
        aria-hidden="true"
      >
        <span v-if="displayText" class="relative inline-block text-transparent">
          {{ displayText }}
          <span class="text-muted absolute top-0 left-full leading-9">¢</span>
        </span>
        <span v-else class="text-muted relative left-2 leading-9">¢</span>
      </span>
    </div>
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
