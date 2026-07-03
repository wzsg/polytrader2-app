<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { CheckCircle2, Save, Trash2, XCircle } from '@lucide/vue';
import type { StrategyCompileResult, StrategyDetail } from '@polytrader/shared';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';
import TitleBar from '@/shared/components/TitleBar.vue';
import MonacoStrategyEditor from './MonacoStrategyEditor.vue';

const params = new URLSearchParams(window.location.search);
const initialMode = params.get('mode') === 'edit' ? 'edit' : 'new';
const initialStrategyId = params.get('strategyId') || '';

const { t } = useI18n();

const strategy = ref<StrategyDetail | null>(null);
const name = ref('');
const sourceCode = ref('');
const loading = ref(false);
const saving = ref(false);
const compiling = ref(false);
const deleting = ref(false);
const error = ref('');
const compileResult = ref<StrategyCompileResult | null>(null);
const showDeleteDialog = ref(false);

const isEditMode = computed(() => Boolean(strategy.value));
const title = computed(() => (isEditMode.value ? t('strategy.editor') : t('strategy.new')));
const subtitle = computed(() =>
  isEditMode.value && strategy.value
    ? `${strategy.value.name} v${strategy.value.currentVersion}`
    : '',
);
const status = computed(
  () => compileResult.value?.status || strategy.value?.compileStatus || 'pending',
);
const statusError = computed(
  () => compileResult.value?.error || strategy.value?.compileError || '',
);
const canSave = computed(() =>
  Boolean(
    name.value.trim() &&
    sourceCode.value.trim() &&
    !loading.value &&
    !saving.value &&
    !compiling.value &&
    !deleting.value,
  ),
);
const canCompile = computed(
  () => !loading.value && !saving.value && !compiling.value && !deleting.value,
);
const editorModelPath = computed(() =>
  strategy.value ? `strategy-${strategy.value.id}.ts` : 'strategy-new.ts',
);

function statusClass(value: string): string {
  if (value === 'success') return 'text-emerald-400';
  if (value === 'failed') return 'text-red-400';
  return 'text-amber-400';
}

async function loadInitialData(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    if (initialMode === 'edit') {
      if (!initialStrategyId) throw new Error(t('strategy.missingId'));
      const res = await window.api.getStrategy(initialStrategyId);
      if (!res.ok) throw new Error(res.error);
      strategy.value = res.data;
      name.value = res.data.name;
      sourceCode.value = res.data.sourceCode;
      return;
    }

    const source = await window.api.getDefaultStrategySource();
    name.value = 'New Strategy';
    sourceCode.value = source;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

async function compileOnly(): Promise<void> {
  if (!canCompile.value) return;
  compiling.value = true;
  error.value = '';
  try {
    const res = await window.api.compileStrategySource(sourceCode.value);
    if (!res.ok) throw new Error(res.error);
    compileResult.value = res.data;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    compiling.value = false;
  }
}

async function saveStrategy(): Promise<void> {
  if (!canSave.value) return;
  saving.value = true;
  error.value = '';
  try {
    const res = strategy.value
      ? await window.api.updateStrategy({
          id: strategy.value.id,
          name: name.value,
          sourceCode: sourceCode.value,
          expectedVersion: strategy.value.currentVersion,
        })
      : await window.api.createStrategy({ name: name.value, sourceCode: sourceCode.value });
    if (!res.ok) throw new Error(res.error);
    strategy.value = res.data;
    name.value = res.data.name;
    sourceCode.value = res.data.sourceCode;
    compileResult.value = null;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    saving.value = false;
  }
}

function requestDelete(): void {
  if (!strategy.value) return;
  showDeleteDialog.value = true;
}

function closeDeleteDialog(): void {
  if (deleting.value) return;
  showDeleteDialog.value = false;
}

async function confirmDelete(): Promise<void> {
  if (!strategy.value) return;
  deleting.value = true;
  error.value = '';
  try {
    const res = await window.api.deleteStrategy(strategy.value.id);
    if (!res.ok) throw new Error(res.error);
    window.api.windowClose();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    deleting.value = false;
  }
}

onMounted(() => {
  void loadInitialData();
});
</script>

<template>
  <div class="bg-bg text-text flex h-screen min-h-0 flex-col overflow-hidden">
    <TitleBar :title="title" :subtitle="subtitle" show-brand-icon />

    <div
      class="border-border bg-surface flex shrink-0 items-center justify-between gap-3 border-b px-5 py-3"
    >
      <div class="min-w-0 flex-1">
        <input
          v-model="name"
          class="border-border bg-bg text-text focus:border-primary w-full rounded-md border px-3 py-2 text-sm outline-none"
          :placeholder="t('strategy.name')"
          :disabled="loading"
        />
        <p v-if="error" class="mt-2 text-sm text-red-400">{{ error }}</p>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <span class="inline-flex items-center gap-1 text-xs" :class="statusClass(status)">
          <CheckCircle2 v-if="status === 'success'" :size="13" />
          <XCircle v-else-if="status === 'failed'" :size="13" />
          {{ status }}
        </span>
        <button
          type="button"
          class="border-border text-text inline-flex items-center gap-2 rounded-md border bg-[#1e1e35] px-3 py-2 text-sm transition-colors hover:bg-[#2a2a45] disabled:opacity-50"
          :disabled="loading || compiling"
          @click="compileOnly"
        >
          <LoadingSpinner v-if="compiling" :size="14" :title="t('strategy.compileStrategy')" />
          <CheckCircle2 v-else :size="14" />
          {{ t('strategy.compile') }}
        </button>
        <button
          type="button"
          class="bg-primary hover:bg-primary-hover inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
          :disabled="loading || !canSave"
          @click="saveStrategy"
        >
          <LoadingSpinner v-if="saving" :size="14" :title="t('strategy.saveStrategy')" />
          <Save v-else :size="14" />
          {{ t('common.save') }}
        </button>
        <button
          v-if="strategy"
          type="button"
          class="border-border text-muted inline-flex h-9 w-9 items-center justify-center rounded border transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
          :title="t('strategy.deleteStrategy')"
          :disabled="loading || saving || deleting"
          @click="requestDelete"
        >
          <LoadingSpinner v-if="deleting" :size="14" :title="t('strategy.deleteStrategy')" />
          <Trash2 v-else :size="14" />
        </button>
      </div>
    </div>

    <main class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div v-if="loading" class="flex flex-1 items-center justify-center">
        <LoadingSpinner :size="22" :title="t('strategy.loadStrategy')" />
      </div>
      <MonacoStrategyEditor
        v-else
        v-model="sourceCode"
        :model-path="editorModelPath"
        :read-only="saving || deleting"
        @save="saveStrategy"
        @compile="compileOnly"
      />

      <div
        v-if="statusError"
        class="selectable-text border-border max-h-44 shrink-0 overflow-auto border-t bg-red-950/20 p-4 font-mono text-xs whitespace-pre-wrap text-red-300"
      >
        {{ statusError }}
      </div>
    </main>

    <Transition name="bot-dialog">
      <div
        v-if="showDeleteDialog && strategy"
        class="app-no-drag fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4"
        @click.self="closeDeleteDialog"
      >
        <div
          class="border-border bg-surface w-full max-w-md overflow-hidden rounded-lg border shadow-2xl"
        >
          <div class="border-border border-b px-5 py-4">
            <h2 class="text-base font-semibold text-white">{{ t('strategy.deleteStrategy') }}</h2>
            <p class="text-muted mt-2 text-sm">
              {{ t('strategy.deleteDescription') }}
            </p>
            <p class="mt-3 truncate text-sm text-white" :title="strategy.name">
              {{ strategy.name }}
            </p>
          </div>
          <div class="border-border flex justify-end gap-2 border-t px-5 py-4">
            <button
              type="button"
              class="border-border text-text inline-flex items-center justify-center rounded-md border bg-[#1e1e35] px-4 py-2 text-sm transition-colors hover:bg-[#2a2a45] disabled:opacity-50"
              :disabled="deleting"
              @click="closeDeleteDialog"
            >
              {{ t('common.cancel') }}
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-md border border-red-500/40 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-50"
              :disabled="deleting"
              @click="confirmDelete"
            >
              <LoadingSpinner v-if="deleting" :size="14" :title="t('strategy.deleteStrategy')" />
              <Trash2 v-else :size="14" />
              {{ t('common.delete') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
