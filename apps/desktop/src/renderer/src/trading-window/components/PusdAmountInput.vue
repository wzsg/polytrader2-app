<script setup lang="ts">
import { computed, ref } from 'vue';
import { Minus, Plus } from '@lucide/vue';
import { useI18n } from 'vue-i18n';

const AMOUNT_STEP_OPTIONS = [1, 10, 100, 1000] as const;
const AMOUNT_STEP_STORAGE_KEY = 'trading-window:manual-order:pusd-amount-step';

type AmountStep = (typeof AMOUNT_STEP_OPTIONS)[number];

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const { t } = useI18n();

const focused = ref(false);
const selectedStep = ref<AmountStep>(readStepPreference());
const placeholder = computed(() => (focused.value ? '' : '0.00'));
const displayText = computed(() => props.modelValue || placeholder.value);
const showDollarPrefix = computed(() => displayText.value || focused.value);

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

function selectStep(step: AmountStep): void {
  selectedStep.value = step;
  writeStepPreference(step);
}

function stepInput(direction: 1 | -1): void {
  const currentValue = Number(props.modelValue) || 0;
  const nextValue = Math.max(0, currentValue + direction * selectedStep.value);
  if (nextValue <= 0) {
    clearInput();
    return;
  }
  emit('update:modelValue', formatAmountValue(nextValue));
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

  const [integerPart, decimalPart = ''] = singleDotValue.split('.');
  if (!singleDotValue.includes('.')) return integerPart ?? '';
  return `${integerPart ?? ''}.${decimalPart.slice(0, 2)}`;
}

function formatAmountValue(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function isZeroInput(value: string): boolean {
  if (!value || value === '.') return false;
  const numericValue = Number(value);
  return !Number.isNaN(numericValue) && numericValue === 0;
}

function clearInput(): void {
  emit('update:modelValue', '');
}

function readStepPreference(): AmountStep {
  const value = Number(window.localStorage.getItem(AMOUNT_STEP_STORAGE_KEY));
  return isAmountStep(value) ? value : 1;
}

function writeStepPreference(step: AmountStep): void {
  window.localStorage.setItem(AMOUNT_STEP_STORAGE_KEY, String(step));
}

function isAmountStep(value: number): value is AmountStep {
  return AMOUNT_STEP_OPTIONS.some((step) => step === value);
}
</script>

<template>
  <div class="mt-1 flex flex-col gap-1.5">
    <div class="grid grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] gap-1">
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
          :value="modelValue"
          type="text"
          inputmode="decimal"
          :placeholder="placeholder"
          class="border-border bg-surface text-text h-9 w-full rounded-md border px-3 text-center text-sm leading-9 tabular-nums outline-none"
          @input="handleInput"
          @focus="handleFocus"
          @blur="handleBlur"
        />
        <span
          v-if="showDollarPrefix"
          class="pointer-events-none absolute inset-0 inline-flex items-center justify-center text-sm leading-9 tabular-nums"
          aria-hidden="true"
        >
          <span v-if="displayText" class="relative inline-block text-transparent">
            {{ displayText }}
            <span class="text-muted absolute top-0 right-full leading-9">$</span>
          </span>
          <span v-else class="text-muted relative right-2 leading-9">$</span>
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
    <div class="grid grid-cols-4 gap-1">
      <button
        v-for="step in AMOUNT_STEP_OPTIONS"
        :key="step"
        type="button"
        class="border-border h-7 rounded-md border px-2 text-xs font-medium tabular-nums transition-colors"
        :class="
          selectedStep === step
            ? 'bg-primary/20 text-primary-light'
            : 'bg-surface text-muted-light hover:bg-btn-secondary hover:text-white'
        "
        @click="selectStep(step)"
      >
        ${{ step }}
      </button>
    </div>
  </div>
</template>
