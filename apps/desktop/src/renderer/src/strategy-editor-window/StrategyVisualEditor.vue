<script setup lang="ts">
import { computed, ref, type Component } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Activity,
  BookOpen,
  Braces,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Database,
  GripVertical,
  ListChecks,
  MessageSquareText,
  Search,
  ShoppingCart,
  Trash2,
  WalletCards,
} from '@lucide/vue';
import type {
  StrategyActionNode,
  StrategyAstDocument,
  StrategyCompareNode,
  StrategyExpressionNode,
} from '@polytrader/strategy-ast/ast';
import {
  StrategyAstEditorModel,
  type StrategyEditorNode,
  type StrategyLibraryNodeKind,
} from './strategyAstEditorModel';

type LibraryCategory = 'trigger' | 'condition' | 'action';

interface LibraryItem {
  category: LibraryCategory;
  kind: StrategyLibraryNodeKind;
  labelKey: string;
  descriptionKey: string;
  icon: Component;
}

const props = defineProps<{
  document: StrategyAstDocument;
  compileError: string;
  simulationVisible: boolean;
}>();

const emit = defineEmits<{
  'update:document': [document: StrategyAstDocument];
}>();

const { t } = useI18n();
const selectedNodeId = ref('');
const libraryFilter = ref('');
const libraryCategory = ref<'all' | 'trigger' | 'condition' | 'action'>('all');
const bottomTab = ref<'diagnostics' | 'simulation'>('diagnostics');
const draggedLibraryKind = ref<StrategyLibraryNodeKind | null>(null);
const activeDropCategory = ref<LibraryCategory | null>(null);
const libraryGroupOrder = ['trigger', 'condition', 'action'] as const;
const libraryDragMime = 'application/x-polytrader-strategy-node';

const model = computed(() => new StrategyAstEditorModel(props.document));
const rule = computed(() => model.value.primaryRule);
const priceCondition = computed<StrategyCompareNode | null>(() => {
  if (rule.value?.trigger.kind !== 'orderBook.changed') return null;
  const condition = rule.value?.condition;
  const candidates = condition?.kind === 'logical' ? condition.items : condition ? [condition] : [];
  return (
    candidates.find(
      (candidate): candidate is StrategyCompareNode =>
        candidate.kind === 'compare' &&
        candidate.left.kind === 'reference' &&
        candidate.left.source === 'orderBook' &&
        candidate.left.field === 'bestAsk',
    ) ?? null
  );
});
const selectedNode = computed<StrategyEditorNode | null>(() =>
  selectedNodeId.value
    ? model.value.findNode(selectedNodeId.value)
    : (priceCondition.value ?? rule.value?.trigger ?? null),
);
const conditionItems = computed<StrategyExpressionNode[]>(() => {
  const condition = rule.value?.condition;
  if (!condition) return [];
  const items = condition.kind === 'logical' ? condition.items : [condition];
  return items.filter((item) => item.id !== priceCondition.value?.id);
});
const threshold = computed(() => {
  const selected = selectedNode.value;
  return selected?.kind === 'compare' ? model.value.priceThreshold(selected.id) : '';
});
const filteredLibrary = computed(() => {
  const query = libraryFilter.value.trim().toLowerCase();
  return libraryItems.value.filter(
    (item) =>
      (libraryCategory.value === 'all' || item.category === libraryCategory.value) &&
      (!query || t(item.labelKey).toLowerCase().includes(query)),
  );
});
const libraryGroups = computed(() =>
  libraryGroupOrder
    .map((category) => ({
      category,
      items: filteredLibrary.value.filter((item) => item.category === category),
    }))
    .filter((group) => group.items.length > 0),
);

const libraryItems = computed<LibraryItem[]>(() => [
  {
    category: 'trigger',
    kind: 'trigger.orderBook',
    labelKey: 'strategy.visual.orderBook',
    descriptionKey: 'strategy.visual.orderBookDescription',
    icon: BookOpen,
  },
  {
    category: 'trigger',
    kind: 'trigger.trade',
    labelKey: 'strategy.visual.tradeReceived',
    descriptionKey: 'strategy.visual.tradeReceivedDescription',
    icon: Activity,
  },
  {
    category: 'trigger',
    kind: 'trigger.timer',
    labelKey: 'strategy.visual.timer',
    descriptionKey: 'strategy.visual.timerDescription',
    icon: Clock3,
  },
  {
    category: 'condition',
    kind: 'condition.marketActive',
    labelKey: 'strategy.visual.marketStatus',
    descriptionKey: 'strategy.visual.marketStatusDescription',
    icon: ListChecks,
  },
  {
    category: 'condition',
    kind: 'condition.priceComparison',
    labelKey: 'strategy.visual.priceComparison',
    descriptionKey: 'strategy.visual.priceComparisonDescription',
    icon: Activity,
  },
  {
    category: 'condition',
    kind: 'condition.accountBalance',
    labelKey: 'strategy.visual.accountBalance',
    descriptionKey: 'strategy.visual.accountBalanceDescription',
    icon: WalletCards,
  },
  {
    category: 'action',
    kind: 'action.limitOrder',
    labelKey: 'strategy.visual.placeLimitOrder',
    descriptionKey: 'strategy.visual.placeLimitOrderDescription',
    icon: ShoppingCart,
  },
  {
    category: 'action',
    kind: 'action.setState',
    labelKey: 'strategy.visual.setState',
    descriptionKey: 'strategy.visual.setStateDescription',
    icon: Database,
  },
  {
    category: 'action',
    kind: 'action.writeLog',
    labelKey: 'strategy.visual.writeLog',
    descriptionKey: 'strategy.visual.writeLogDescription',
    icon: MessageSquareText,
  },
]);

function selectNode(nodeId: string): void {
  selectedNodeId.value = nodeId;
}

function updateDocument(document: StrategyAstDocument): void {
  emit('update:document', document);
}

function updateThreshold(value: string): void {
  const node = selectedNode.value;
  if (!node || node.kind !== 'compare') return;
  updateDocument(model.value.updatePriceThreshold(node.id, value));
}

function updateOperator(value: string): void {
  const node = selectedNode.value;
  if (!node || node.kind !== 'compare') return;
  updateDocument(
    model.value.updateCompareOperator(node.id, value as StrategyCompareNode['operator']),
  );
}

function removeNode(nodeId: string): void {
  if (selectedNodeId.value === nodeId) selectedNodeId.value = '';
  updateDocument(model.value.removeNode(nodeId));
}

function addCondition(): void {
  addLibraryNode('condition.marketActive');
}

function addAction(): void {
  addLibraryNode('action.writeLog');
}

function addLibraryNode(kind: StrategyLibraryNodeKind): void {
  updateDocument(model.value.addLibraryNode(kind));
}

function startLibraryDrag(event: DragEvent, item: LibraryItem): void {
  if (!event.dataTransfer) return;
  draggedLibraryKind.value = item.kind;
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData(libraryDragMime, item.kind);
  event.dataTransfer.setData('text/plain', t(item.labelKey));
}

function finishLibraryDrag(): void {
  draggedLibraryKind.value = null;
  activeDropCategory.value = null;
}

function handleDragOver(event: DragEvent, category: LibraryCategory): void {
  const item = draggedLibraryKind.value
    ? libraryItems.value.find((candidate) => candidate.kind === draggedLibraryKind.value)
    : null;
  if (item?.category !== category) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  activeDropCategory.value = category;
}

function handleDragLeave(event: DragEvent, category: LibraryCategory): void {
  const currentTarget = event.currentTarget as HTMLElement | null;
  const nextTarget = event.relatedTarget as Node | null;
  if (currentTarget && nextTarget && currentTarget.contains(nextTarget)) return;
  if (activeDropCategory.value === category) activeDropCategory.value = null;
}

function dropLibraryNode(event: DragEvent, category: LibraryCategory): void {
  const kind = event.dataTransfer?.getData(libraryDragMime) as StrategyLibraryNodeKind | '';
  const item = libraryItems.value.find((candidate) => candidate.kind === kind);
  if (!item || item.category !== category) {
    finishLibraryDrag();
    return;
  }
  addLibraryNode(item.kind);
  finishLibraryDrag();
}

function conditionLabel(node: StrategyExpressionNode): string {
  if (node.kind === 'compare') {
    return `${model.value.referenceLabel(node.left)} ${operatorLabel(node.operator)} ${model.value.referenceLabel(node.right)}`;
  }
  if (node.kind === 'logical') {
    return node.operator === 'all'
      ? t('strategy.visual.allConditions')
      : t('strategy.visual.anyCondition');
  }
  return kindLabel(node.kind);
}

function actionLabel(action: StrategyActionNode): string {
  if (action.kind === 'order.place') {
    return action.side === 'BUY'
      ? t('strategy.visual.placeLimitBuy')
      : t('strategy.visual.placeLimitSell');
  }
  return kindLabel(action.kind);
}

function actionSummary(action: StrategyActionNode): string {
  if (action.kind === 'order.place') {
    if (action.order.orderType === 'limit') {
      return `${model.value.referenceLabel(action.order.shares)} @ ${model.value.referenceLabel(action.order.price)}`;
    }
    return model.value.referenceLabel(action.order.amount);
  }
  if (action.kind === 'state.set') return action.name;
  if (action.kind === 'state.increment') return action.name;
  if (action.kind === 'log.write') return action.message;
  return action.kind === 'strategy.stop' ? action.reason || t('strategy.visual.stopStrategy') : '';
}

function kindLabel(kind: string): string {
  const labels: Record<string, string> = {
    'orderBook.changed': t('strategy.visual.orderBookChanged'),
    'trade.received': t('strategy.visual.tradeReceived'),
    'account.changed': t('strategy.visual.accountChanged'),
    'timer.interval': t('strategy.visual.timerInterval'),
    'strategy.started': t('strategy.visual.strategyStarted'),
    'strategy.stopping': t('strategy.visual.strategyStopping'),
    'state.set': t('strategy.visual.setState'),
    'state.increment': t('strategy.visual.incrementState'),
    'log.write': t('strategy.visual.writeLog'),
    'strategy.stop': t('strategy.visual.stopStrategy'),
  };
  return labels[kind] ?? kind;
}

function operatorLabel(operator: StrategyCompareNode['operator']): string {
  const labels: Record<StrategyCompareNode['operator'], string> = {
    eq: '=',
    neq: '≠',
    gt: '>',
    gte: '≥',
    lt: '<',
    lte: '≤',
  };
  return labels[operator];
}

function categoryLabel(category: LibraryCategory): string {
  return t(`strategy.visual.${category}s`);
}
</script>

<template>
  <div class="grid min-h-0 flex-1 grid-cols-[252px_minmax(420px,1fr)_292px] overflow-hidden">
    <aside class="border-border bg-sidebar flex min-h-0 flex-col border-r">
      <div class="border-border border-b p-3">
        <h2 class="mb-2 text-xs font-semibold tracking-wide text-white uppercase">
          {{ t('strategy.visual.library') }}
        </h2>
        <label class="border-border bg-bg flex items-center gap-2 rounded-md border px-2.5 py-2">
          <Search :size="14" class="text-muted shrink-0" />
          <input
            v-model="libraryFilter"
            class="text-text min-w-0 flex-1 bg-transparent text-xs outline-none"
            :placeholder="t('strategy.visual.searchBlocks')"
          />
        </label>
        <div class="mt-2 grid grid-cols-4 gap-1">
          <button
            v-for="category in ['all', 'trigger', 'condition', 'action'] as const"
            :key="category"
            type="button"
            class="rounded px-1 py-1.5 text-[11px] transition-colors"
            :class="
              libraryCategory === category
                ? 'bg-primary/25 text-primary-light'
                : 'text-muted hover:bg-white/5 hover:text-white'
            "
            @click="libraryCategory = category"
          >
            {{ category === 'all' ? t('common.all') : categoryLabel(category) }}
          </button>
        </div>
      </div>

      <div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        <section v-for="group in libraryGroups" :key="group.category">
          <h3 class="text-muted mb-1.5 px-1 text-[10px] font-semibold tracking-[0.12em] uppercase">
            {{ categoryLabel(group.category) }}
          </h3>
          <div class="space-y-1">
            <button
              v-for="item in group.items"
              :key="item.labelKey"
              type="button"
              draggable="true"
              class="border-border bg-surface/55 hover:border-primary/50 hover:bg-primary/10 flex w-full cursor-grab items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-all active:cursor-grabbing"
              :class="{ 'opacity-45': draggedLibraryKind === item.kind }"
              @click="addLibraryNode(item.kind)"
              @dragstart="startLibraryDrag($event, item)"
              @dragend="finishLibraryDrag"
            >
              <component :is="item.icon" :size="15" class="text-primary-light mt-0.5 shrink-0" />
              <span class="min-w-0">
                <span class="block text-xs font-medium text-white">{{ t(item.labelKey) }}</span>
                <span class="text-muted mt-0.5 block text-[10px] leading-4">
                  {{ t(item.descriptionKey) }}
                </span>
              </span>
            </button>
          </div>
        </section>
      </div>
    </aside>

    <section class="bg-bg flex min-h-0 min-w-0 flex-col overflow-hidden">
      <div class="text-muted border-border border-b px-4 py-2 text-xs">
        {{ t('strategy.visual.builderHint') }}
      </div>

      <div
        class="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_1px_1px,#2a2a3e_1px,transparent_0)] bg-[size:18px_18px] p-4"
      >
        <div v-if="rule" class="border-border bg-surface/75 overflow-hidden rounded-lg border">
          <section
            class="border-border border-b border-l-2 border-l-blue-500 px-4 py-4 transition-colors"
            :class="{
              'bg-blue-500/10 ring-1 ring-blue-400/70 ring-inset': activeDropCategory === 'trigger',
            }"
            @dragover="handleDragOver($event, 'trigger')"
            @dragleave="handleDragLeave($event, 'trigger')"
            @drop.prevent="dropLibraryNode($event, 'trigger')"
          >
            <div class="mb-3 flex items-center gap-2">
              <span class="text-sm font-semibold tracking-wide text-blue-400">WHEN</span>
              <span class="text-muted text-xs">{{ t('strategy.visual.marketEventOccurs') }}</span>
              <span
                v-if="activeDropCategory === 'trigger'"
                class="ml-auto rounded bg-blue-500/15 px-2 py-1 text-[10px] text-blue-300"
              >
                {{ t('strategy.visual.dropNodeHere') }}
              </span>
            </div>
            <div
              class="border-border bg-bg flex w-full items-center gap-3 rounded-md border px-3 py-2.5"
              :class="{
                'border-primary ring-primary/30 ring-1':
                  selectedNode?.id === rule.trigger.id || selectedNode?.id === priceCondition?.id,
              }"
            >
              <GripVertical :size="15" class="text-muted" />
              <button
                type="button"
                class="flex shrink-0 items-center gap-2 text-sm text-white"
                @click="selectNode(rule.trigger.id)"
              >
                <BookOpen :size="17" class="text-blue-400" />
                {{ kindLabel(rule.trigger.kind) }}
              </button>
              <template v-if="priceCondition">
                <span
                  class="border-border bg-surface ml-auto rounded border px-3 py-1.5 text-xs text-white"
                >
                  {{ t('strategy.visual.bestAsk') }}
                </span>
                <button
                  type="button"
                  class="border-border bg-surface flex items-center gap-2 rounded border px-3 py-1.5 text-xs text-white"
                  @click="selectNode(priceCondition.id)"
                >
                  {{ operatorLabel(priceCondition.operator) }}
                  <ChevronDown :size="12" class="text-muted" />
                </button>
                <input
                  class="border-border bg-surface focus:border-primary w-20 rounded border px-3 py-1.5 text-xs text-white outline-none"
                  :value="model.priceThreshold(priceCondition.id)"
                  :aria-label="t('strategy.visual.threshold')"
                  @focus="selectNode(priceCondition.id)"
                  @input="
                    updateDocument(
                      model.updatePriceThreshold(
                        priceCondition.id,
                        ($event.target as HTMLInputElement).value,
                      ),
                    )
                  "
                />
              </template>
              <span v-else class="text-muted ml-auto text-xs">
                {{ t('strategy.visual.selectedOutcome') }}
              </span>
            </div>
            <p v-if="priceCondition" class="text-muted mt-2 text-xs">
              {{
                t('strategy.visual.priceTriggerSummary', {
                  value: model.priceThreshold(priceCondition.id),
                })
              }}
            </p>
          </section>

          <section
            class="border-border border-b border-l-2 border-l-violet-500 px-4 py-4 transition-colors"
            :class="{
              'bg-violet-500/10 ring-1 ring-violet-400/70 ring-inset':
                activeDropCategory === 'condition',
            }"
            @dragover="handleDragOver($event, 'condition')"
            @dragleave="handleDragLeave($event, 'condition')"
            @drop.prevent="dropLibraryNode($event, 'condition')"
          >
            <div class="mb-3 flex items-center gap-2">
              <span class="text-sm font-semibold tracking-wide text-violet-400">IF</span>
              <span class="text-muted text-xs">{{ t('strategy.visual.allConditions') }}</span>
              <span
                v-if="activeDropCategory === 'condition'"
                class="ml-auto rounded bg-violet-500/15 px-2 py-1 text-[10px] text-violet-300"
              >
                {{ t('strategy.visual.dropNodeHere') }}
              </span>
            </div>
            <div class="space-y-2">
              <div
                v-for="condition in conditionItems"
                :key="condition.id"
                class="border-border bg-bg hover:border-primary/60 flex w-full items-center rounded-md border transition-colors"
                :class="{
                  'border-primary ring-primary/30 ring-1': selectedNode?.id === condition.id,
                }"
              >
                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left"
                  @click="selectNode(condition.id)"
                >
                  <GripVertical :size="15" class="text-muted" />
                  <Activity :size="17" class="text-violet-400" />
                  <span class="min-w-0 flex-1 truncate text-sm text-white">
                    {{ conditionLabel(condition) }}
                  </span>
                </button>
                <button
                  type="button"
                  class="text-muted mr-2 rounded p-1 hover:bg-red-500/10 hover:text-red-300"
                  :title="t('common.delete')"
                  @click="removeNode(condition.id)"
                >
                  <Trash2 :size="14" />
                </button>
              </div>
            </div>
            <button
              type="button"
              class="border-border text-muted mt-3 rounded-md border px-3 py-1.5 text-xs hover:bg-white/5 hover:text-white"
              @click="addCondition"
            >
              + {{ t('strategy.visual.addCondition') }}
            </button>
          </section>

          <section
            class="border-l-2 border-l-emerald-500 px-4 py-4 transition-colors"
            :class="{
              'bg-emerald-500/10 ring-1 ring-emerald-400/70 ring-inset':
                activeDropCategory === 'action',
            }"
            @dragover="handleDragOver($event, 'action')"
            @dragleave="handleDragLeave($event, 'action')"
            @drop.prevent="dropLibraryNode($event, 'action')"
          >
            <div class="mb-3 flex items-center gap-2">
              <span class="text-sm font-semibold tracking-wide text-emerald-400">THEN</span>
              <span class="text-muted text-xs">{{ t('strategy.visual.actionsInOrder') }}</span>
              <span
                v-if="activeDropCategory === 'action'"
                class="ml-auto rounded bg-emerald-500/15 px-2 py-1 text-[10px] text-emerald-300"
              >
                {{ t('strategy.visual.dropNodeHere') }}
              </span>
            </div>
            <div class="space-y-2">
              <div
                v-for="(action, index) in rule.actions"
                :key="action.id"
                class="border-border bg-bg hover:border-primary/60 flex w-full items-center rounded-md border transition-colors"
                :class="{ 'border-primary ring-primary/30 ring-1': selectedNode?.id === action.id }"
              >
                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left"
                  @click="selectNode(action.id)"
                >
                  <GripVertical :size="15" class="text-muted" />
                  <span class="text-muted w-4 text-center text-xs">{{ index + 1 }}</span>
                  <ShoppingCart
                    v-if="action.kind === 'order.place'"
                    :size="17"
                    class="text-emerald-400"
                  />
                  <Database
                    v-else-if="action.kind === 'state.set' || action.kind === 'state.increment'"
                    :size="17"
                    class="text-emerald-400"
                  />
                  <MessageSquareText v-else :size="17" class="text-emerald-400" />
                  <span class="min-w-0 flex-1">
                    <span class="block text-sm text-white">{{ actionLabel(action) }}</span>
                    <span class="text-muted mt-0.5 block truncate text-[10px]">
                      {{ actionSummary(action) }}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  class="text-muted mr-2 rounded p-1 hover:bg-red-500/10 hover:text-red-300"
                  :title="t('common.delete')"
                  @click="removeNode(action.id)"
                >
                  <Trash2 :size="14" />
                </button>
              </div>
            </div>
            <button
              type="button"
              class="border-border text-muted mt-3 rounded-md border px-3 py-1.5 text-xs hover:bg-white/5 hover:text-white"
              @click="addAction"
            >
              + {{ t('strategy.visual.addAction') }}
            </button>
          </section>
        </div>
      </div>

      <div class="border-border bg-surface shrink-0 border-t">
        <div class="border-border flex items-center gap-1 border-b px-3 py-2">
          <button
            type="button"
            class="rounded px-3 py-1.5 text-xs"
            :class="bottomTab === 'diagnostics' ? 'bg-primary/20 text-primary-light' : 'text-muted'"
            @click="bottomTab = 'diagnostics'"
          >
            <Braces :size="14" class="mr-1 inline" />
            {{ t('strategy.visual.diagnostics') }}
          </button>
          <button
            type="button"
            class="rounded px-3 py-1.5 text-xs"
            :class="bottomTab === 'simulation' ? 'bg-primary/20 text-primary-light' : 'text-muted'"
            @click="bottomTab = 'simulation'"
          >
            <Activity :size="14" class="mr-1 inline" />
            {{ t('strategy.visual.simulation') }}
          </button>
        </div>
        <div class="h-32 overflow-auto p-4 text-xs">
          <pre
            v-if="bottomTab === 'diagnostics' && compileError"
            class="selectable-text whitespace-pre-wrap text-red-300"
            >{{ compileError }}</pre>
          <div
            v-else-if="bottomTab === 'diagnostics'"
            class="flex items-center gap-2 text-emerald-400"
          >
            <ListChecks :size="16" />
            {{ t('strategy.visual.noDiagnostics') }}
          </div>
          <div
            v-else-if="simulationVisible"
            class="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-6"
          >
            <div>
              <div class="text-muted mb-1">{{ t('strategy.visual.bestAsk') }}</div>
              <div class="text-xl font-semibold text-emerald-400">0.42</div>
            </div>
            <div class="text-lg text-white">≤</div>
            <div>
              <div class="text-muted mb-1">{{ t('strategy.visual.threshold') }}</div>
              <div class="text-primary-light text-xl font-semibold">{{ threshold || '0.45' }}</div>
            </div>
            <div class="rounded bg-emerald-500/15 px-3 py-1.5 text-emerald-400">
              {{ t('strategy.visual.evaluatedTrue') }}
            </div>
          </div>
          <div v-else class="text-muted">{{ t('strategy.visual.runSimulationHint') }}</div>
        </div>
      </div>
    </section>

    <aside class="border-border bg-sidebar min-h-0 overflow-y-auto border-l p-4">
      <h2 class="mb-4 text-xs font-semibold tracking-wide text-white uppercase">
        {{ t('strategy.visual.inspector') }}
      </h2>
      <template v-if="selectedNode">
        <div class="mb-5 flex items-start gap-3">
          <div class="bg-primary/15 text-primary-light rounded-md p-2">
            <CircleDollarSign v-if="selectedNode.kind === 'compare'" :size="18" />
            <BookOpen v-else :size="18" />
          </div>
          <div class="min-w-0">
            <div class="truncate text-sm font-semibold text-white">
              {{ kindLabel(selectedNode.kind) }}
            </div>
            <div class="text-muted mt-1 text-[10px] break-all">{{ selectedNode.id }}</div>
          </div>
        </div>

        <template v-if="selectedNode.kind === 'compare'">
          <label class="mb-4 block">
            <span class="text-muted mb-1.5 block text-xs">{{ t('strategy.visual.operator') }}</span>
            <select
              class="border-border bg-bg text-text w-full rounded-md border px-3 py-2 text-sm outline-none"
              :value="selectedNode.operator"
              @change="updateOperator(($event.target as HTMLSelectElement).value)"
            >
              <option value="eq">=</option>
              <option value="neq">≠</option>
              <option value="gt">&gt;</option>
              <option value="gte">≥</option>
              <option value="lt">&lt;</option>
              <option value="lte">≤</option>
            </select>
          </label>
          <label class="mb-4 block">
            <span class="text-muted mb-1.5 block text-xs">{{ t('strategy.visual.value') }}</span>
            <input
              class="border-border bg-bg text-text focus:border-primary w-full rounded-md border px-3 py-2 text-sm outline-none"
              :value="threshold"
              @input="updateThreshold(($event.target as HTMLInputElement).value)"
            />
          </label>
          <div class="border-border bg-surface rounded-md border p-3">
            <h3 class="mb-2 text-xs font-medium text-white">
              {{ t('strategy.visual.whatThisMeans') }}
            </h3>
            <p class="text-muted text-xs leading-5">
              {{ t('strategy.visual.priceConditionMeaning', { value: threshold || '—' }) }}
            </p>
          </div>
        </template>
        <div v-else class="border-border bg-surface rounded-md border p-3">
          <p class="text-muted text-xs leading-5">
            {{ t('strategy.visual.nodeIdHint') }}
          </p>
        </div>
      </template>
    </aside>
  </div>
</template>
