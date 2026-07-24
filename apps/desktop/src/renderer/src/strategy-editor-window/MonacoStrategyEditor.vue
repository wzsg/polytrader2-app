<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import 'monaco-editor/esm/vs/language/json/monaco.contribution.js';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';

const MONACO_THEME = 'polytrader-dark';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    modelPath: string;
    language?: string;
    readOnly?: boolean;
  }>(),
  {
    language: 'json',
    readOnly: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  save: [];
  compile: [];
}>();

const containerRef = ref<HTMLElement | null>(null);
const { t } = useI18n();

let editorInstance: monaco.editor.IStandaloneCodeEditor | null = null;
let activeModel: monaco.editor.ITextModel | null = null;
let ownedModel: monaco.editor.ITextModel | null = null;
let modelChangeDisposable: monaco.IDisposable | null = null;
let updatingFromProps = false;
let configured = false;

function configureMonacoEnvironment(): void {
  globalThis.MonacoEnvironment = {
    getWorker(_workerId: string, label: string) {
      if (label === 'json') return new JsonWorker();
      return new EditorWorker();
    },
  };
}

function configureMonaco(): void {
  if (configured) return;
  configured = true;

  monaco.editor.defineTheme(MONACO_THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6b7280' },
      { token: 'keyword', foreground: '8babff' },
      { token: 'string', foreground: 'a7f3d0' },
      { token: 'number', foreground: 'fbbf24' },
      { token: 'type.identifier', foreground: 'c4b5fd' },
    ],
    colors: {
      'editor.background': '#0f0f1a',
      'editor.foreground': '#e0e0e0',
      'editor.lineHighlightBackground': '#1a1a2e',
      'editor.selectionBackground': '#4361ee55',
      'editor.inactiveSelectionBackground': '#4361ee2f',
      'editorCursor.foreground': '#8babff',
      'editorGutter.background': '#0f0f1a',
      'editorLineNumber.foreground': '#66667a',
      'editorLineNumber.activeForeground': '#e0e0e0',
      'editorIndentGuide.background1': '#2a2a3e',
      'editorIndentGuide.activeBackground1': '#8babff66',
      'editorWidget.background': '#1a1a2e',
      'editorWidget.border': '#2a2a3e',
      'input.background': '#14142a',
      'input.border': '#2a2a3e',
      'list.hoverBackground': '#2a2a45',
    },
  });
}

function createModelUri(modelPath: string): monaco.Uri {
  const normalizedPath = modelPath.replace(/^\/+/, '') || 'strategy.ts';
  return monaco.Uri.from({ scheme: 'file', path: `/${normalizedPath}` });
}

function syncModelValue(model: monaco.editor.ITextModel, value: string): void {
  if (model.getValue() === value) return;
  updatingFromProps = true;
  model.setValue(value);
  updatingFromProps = false;
}

function setEditorModel(modelPath: string, value: string): void {
  const uri = createModelUri(modelPath);
  const existingModel = monaco.editor.getModel(uri);
  const nextModel = existingModel ?? monaco.editor.createModel(value, props.language, uri);

  if (ownedModel && ownedModel !== nextModel) {
    ownedModel.dispose();
  }
  ownedModel = existingModel ? null : nextModel;
  activeModel = nextModel;

  modelChangeDisposable?.dispose();
  modelChangeDisposable = nextModel.onDidChangeContent(() => {
    if (!updatingFromProps) {
      emit('update:modelValue', nextModel.getValue());
    }
  });

  syncModelValue(nextModel, value);
  editorInstance?.setModel(nextModel);
}

onMounted(() => {
  if (!containerRef.value) return;

  configureMonacoEnvironment();
  configureMonaco();

  editorInstance = monaco.editor.create(containerRef.value, {
    model: null,
    theme: MONACO_THEME,
    automaticLayout: true,
    fontFamily: "'Cascadia Code', Consolas, 'Courier New', monospace",
    fontSize: 13,
    lineHeight: 21,
    lineNumbersMinChars: 3,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    tabSize: 2,
    insertSpaces: true,
    wordWrap: 'on',
    renderWhitespace: 'selection',
    padding: { top: 16, bottom: 16 },
    overviewRulerBorder: false,
    smoothScrolling: true,
    readOnly: props.readOnly,
    domReadOnly: props.readOnly,
    ariaLabel: t('strategy.codeEditor'),
  });

  editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
    emit('save');
  });
  editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB, () => {
    emit('compile');
  });

  setEditorModel(props.modelPath, props.modelValue);
});

watch(
  () => props.modelValue,
  (value) => {
    if (activeModel) syncModelValue(activeModel, value);
  },
);

watch(
  () => props.modelPath,
  (modelPath) => {
    setEditorModel(modelPath, props.modelValue);
  },
);

watch(
  () => props.readOnly,
  (readOnly) => {
    editorInstance?.updateOptions({ readOnly, domReadOnly: readOnly });
  },
);

onBeforeUnmount(() => {
  modelChangeDisposable?.dispose();
  editorInstance?.dispose();
  ownedModel?.dispose();
  modelChangeDisposable = null;
  editorInstance = null;
  activeModel = null;
  ownedModel = null;
});
</script>

<template>
  <div ref="containerRef" class="min-h-0 flex-1 overflow-hidden" />
</template>
