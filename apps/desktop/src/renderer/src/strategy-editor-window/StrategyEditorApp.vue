<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Braces, CheckCircle2, Code2, Play, Save, Trash2, XCircle } from '@lucide/vue';
import type { StrategyAstDocument } from '@polytrader/strategy-ast/ast';
import type { StrategyCompileResult, StrategyDetail } from '@polytrader/shared';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';
import TitleBar from '@/shared/components/TitleBar.vue';
import MonacoStrategyEditor from './MonacoStrategyEditor.vue';
import StrategyVisualEditor from './StrategyVisualEditor.vue';
import { StrategyAstEditorModel } from './strategyAstEditorModel';

const params = new URLSearchParams(window.location.search);
const initialMode = params.get('mode') === 'edit' ? 'edit' : 'new';
const initialStrategyId = params.get('strategyId') || '';

const { t } = useI18n();

const strategy = ref<StrategyDetail | null>(null);
const name = ref('');
const sourceCode = ref('');
const astDocument = ref<StrategyAstDocument | null>(null);
const editorMode = ref<'visual' | 'code'>('visual');
const loading = ref(false);
const saving = ref(false);
const compiling = ref(false);
const deleting = ref(false);
const error = ref('');
const codeError = ref('');
const compileResult = ref<StrategyCompileResult | null>(null);
const showDeleteDialog = ref(false);
const simulationVisible = ref(false);

const subtitle = computed(() =>
  strategy.value ? `${strategy.value.name} · v${strategy.value.currentVersion}` : '',
);
const status = computed(
  () => compileResult.value?.status || strategy.value?.compileStatus || 'pending',
);
const statusError = computed(
  () => codeError.value || compileResult.value?.error || strategy.value?.compileError || '',
);
const canSave = computed(
  () =>
    Boolean(name.value.trim() && sourceCode.value.trim() && astDocument.value) &&
    !loading.value &&
    !saving.value &&
    !compiling.value &&
    !deleting.value,
);
const canCompile = computed(
  () =>
    Boolean(astDocument.value) &&
    !loading.value &&
    !saving.value &&
    !compiling.value &&
    !deleting.value,
);
const editorModelPath = computed(() =>
  strategy.value ? `strategy-${strategy.value.id}.json` : 'strategy-new.json',
);

function statusClass(value: string): string {
  if (value === 'success') return 'text-emerald-400';
  if (value === 'failed') return 'text-red-400';
  return 'text-amber-400';
}

function parseSource(value: string): void {
  try {
    astDocument.value = StrategyAstEditorModel.parse(value);
    codeError.value = '';
  } catch (parseError) {
    astDocument.value = null;
    const message = parseError instanceof Error ? parseError.message : String(parseError);
    codeError.value = t('strategy.visual.invalidJson', { error: message });
  }
}

function updateCode(value: string): void {
  sourceCode.value = value;
  compileResult.value = null;
  parseSource(value);
}

function updateVisual(document: StrategyAstDocument): void {
  astDocument.value = document;
  sourceCode.value = StrategyAstEditorModel.stringify(document);
  compileResult.value = null;
  codeError.value = '';
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
      parseSource(sourceCode.value);
      if (!astDocument.value) editorMode.value = 'code';
      return;
    }

    const source = await window.api.getDefaultStrategySource();
    name.value = t('strategy.new');
    sourceCode.value = source;
    parseSource(source);
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : String(loadError);
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
  } catch (compileError) {
    error.value = compileError instanceof Error ? compileError.message : String(compileError);
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
    parseSource(sourceCode.value);
    compileResult.value = null;
  } catch (saveError) {
    error.value = saveError instanceof Error ? saveError.message : String(saveError);
  } finally {
    saving.value = false;
  }
}

function showSimulation(): void {
  simulationVisible.value = true;
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
  } catch (deleteError) {
    error.value = deleteError instanceof Error ? deleteError.message : String(deleteError);
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
    <TitleBar :title="t('strategy.editor')" :subtitle="subtitle" show-brand-icon />

    <div class="border-border bg-surface flex shrink-0 items-center gap-4 border-b px-4 py-2.5">
      <div class="min-w-[220px] flex-1">
        <input
          v-model="name"
          class="border-border bg-bg text-text focus:border-primary w-full rounded-md border px-3 py-2 text-sm outline-none"
          :placeholder="t('strategy.name')"
          :disabled="loading"
        />
        <p v-if="error" class="mt-1.5 truncate text-xs text-red-400" :title="error">{{ error }}</p>
      </div>

      <span class="inline-flex shrink-0 items-center gap-1.5 text-xs" :class="statusClass(status)">
        <CheckCircle2 v-if="status === 'success'" :size="14" />
        <XCircle v-else-if="status === 'failed'" :size="14" />
        <Braces v-else :size="14" />
        {{ status === 'success' ? t('strategy.visual.valid') : status }}
      </span>

      <div class="border-border bg-bg flex shrink-0 rounded-md border p-0.5">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs transition-colors"
          :class="editorMode === 'visual' ? 'bg-primary text-white' : 'text-muted hover:text-white'"
          :disabled="!astDocument"
          @click="editorMode = 'visual'"
        >
          <Braces :size="14" />
          {{ t('strategy.visual.visualMode') }}
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs transition-colors"
          :class="editorMode === 'code' ? 'bg-primary text-white' : 'text-muted hover:text-white'"
          @click="editorMode = 'code'"
        >
          <Code2 :size="14" />
          {{ t('strategy.visual.codeMode') }}
        </button>
      </div>

      <button
        type="button"
        class="border-border text-text inline-flex shrink-0 items-center gap-2 rounded-md border bg-[#1e1e35] px-3 py-2 text-sm transition-colors hover:bg-[#2a2a45] disabled:opacity-50"
        :disabled="!canCompile"
        @click="compileOnly"
      >
        <LoadingSpinner v-if="compiling" :size="14" :title="t('strategy.compileStrategy')" />
        <CheckCircle2 v-else :size="14" />
        {{ t('strategy.compile') }}
      </button>
      <button
        type="button"
        class="border-border text-text inline-flex shrink-0 items-center gap-2 rounded-md border bg-[#1e1e35] px-3 py-2 text-sm transition-colors hover:bg-[#2a2a45] disabled:opacity-50"
        :disabled="!astDocument"
        @click="showSimulation"
      >
        <Play :size="14" />
        {{ t('strategy.visual.simulate') }}
      </button>
      <button
        type="button"
        class="bg-primary hover:bg-primary-hover inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
        :disabled="!canSave"
        @click="saveStrategy"
      >
        <LoadingSpinner v-if="saving" :size="14" :title="t('strategy.saveStrategy')" />
        <Save v-else :size="14" />
        {{ t('common.save') }}
      </button>
      <button
        v-if="strategy"
        type="button"
        class="border-border text-muted inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
        :title="t('strategy.deleteStrategy')"
        :disabled="loading || saving || deleting"
        @click="requestDelete"
      >
        <LoadingSpinner v-if="deleting" :size="14" :title="t('strategy.deleteStrategy')" />
        <Trash2 v-else :size="14" />
      </button>
    </div>

    <main class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div v-if="loading" class="flex flex-1 items-center justify-center">
        <LoadingSpinner :size="22" :title="t('strategy.loadStrategy')" />
      </div>
      <StrategyVisualEditor
        v-else-if="editorMode === 'visual' && astDocument"
        :document="astDocument"
        :compile-error="statusError"
        :simulation-visible="simulationVisible"
        @update:document="updateVisual"
      />
      <template v-else>
        <MonacoStrategyEditor
          :model-value="sourceCode"
          :model-path="editorModelPath"
          language="json"
          :read-only="saving || deleting"
          @update:model-value="updateCode"
          @save="saveStrategy"
          @compile="compileOnly"
        />
        <div
          v-if="statusError"
          class="selectable-text border-border max-h-40 shrink-0 overflow-auto border-t bg-red-950/20 p-4 font-mono text-xs whitespace-pre-wrap text-red-300"
        >
          {{ statusError }}
        </div>
      </template>
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
            <p class="text-muted mt-2 text-sm">{{ t('strategy.deleteDescription') }}</p>
            <p class="mt-3 truncate text-sm text-white" :title="strategy.name">
              {{ strategy.name }}
            </p>
          </div>
          <div class="border-border flex justify-end gap-2 border-t px-5 py-4">
            <button
              type="button"
              class="border-border text-text rounded-md border bg-[#1e1e35] px-4 py-2 text-sm"
              :disabled="deleting"
              @click="closeDeleteDialog"
            >
              {{ t('common.cancel') }}
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-md border border-red-500/40 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-500/10"
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
