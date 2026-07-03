<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { Bot } from '@lucide/vue';
import type {
  StrategyBotListItem,
  StrategyListItem,
  StrategyVersionSummary,
  PolymarketWalletSummary,
} from '@polytrader/shared';
import WalletSelect from './WalletSelect.vue';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  marketId: string;
  conditionId?: string | null;
  marketTitle: string;
  selectedTokenId?: string | null;
  accounts: PolymarketWalletSummary[];
}>();

const emit = defineEmits<{
  changed: [];
}>();

const { t } = useI18n();

const strategies = ref<StrategyListItem[]>([]);
const versions = ref<StrategyVersionSummary[]>([]);
const bots = ref<StrategyBotListItem[]>([]);
const loading = ref(false);
const creating = ref(false);
const error = ref('');
const lastDefaultName = ref('');

const form = reactive({
  name: '',
  strategyId: '',
  strategyVersion: '',
  walletId: '',
  config: '{}',
  autoStart: false,
});

const tradableAccounts = computed(() =>
  props.accounts.filter((account) => account.credentialsConfigured),
);

function getDefaultNameBase(): string {
  return `${props.marketTitle || props.marketId} Bot`;
}

function makeUniqueDefaultName(base: string, names: string[]): string {
  const used = new Set(names);
  if (!used.has(base)) return base;
  let index = 2;
  while (used.has(`${base} ${index}`)) index += 1;
  return `${base} ${index}`;
}

function applyDefaultName(force = false): void {
  const shouldApply =
    force || !form.name || form.name === 'Market Bot' || form.name === lastDefaultName.value;
  if (!shouldApply) return;
  const nextName = makeUniqueDefaultName(
    getDefaultNameBase(),
    bots.value.map((bot) => bot.name),
  );
  form.name = nextName;
  lastDefaultName.value = nextName;
}

function setDefaults(): void {
  applyDefaultName();
  if (!form.strategyId) form.strategyId = strategies.value[0]?.id || '';
  if (!tradableAccounts.value.some((account) => account.id === form.walletId)) {
    form.walletId =
      tradableAccounts.value.find((account) => account.isDefault)?.id ||
      tradableAccounts.value[0]?.id ||
      '';
  }
}

async function loadVersions(): Promise<void> {
  versions.value = [];
  if (!form.strategyId) return;
  const res = await window.api.listStrategyVersions(form.strategyId);
  versions.value = res.ok ? res.data : [];
  if (!form.strategyVersion) {
    const current = strategies.value.find((item) => item.id === form.strategyId)?.currentVersion;
    form.strategyVersion = current ? String(current) : String(versions.value[0]?.version || '');
  }
}

async function refresh(): Promise<void> {
  if (!props.marketId) return;
  loading.value = true;
  error.value = '';
  try {
    const [strategyRes, botRes] = await Promise.all([
      window.api.listStrategies(),
      window.api.listBots({ limit: 1_000 }),
    ]);
    strategies.value = strategyRes.ok ? strategyRes.data : [];
    bots.value = botRes.ok ? botRes.data : [];
    setDefaults();
    await loadVersions();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

async function createBot(): Promise<void> {
  if (!props.conditionId || !props.selectedTokenId || !form.strategyId || !form.walletId) return;
  creating.value = true;
  error.value = '';
  try {
    const res = await window.api.createBot({
      name: form.name,
      conditionId: props.conditionId,
      assetId: props.selectedTokenId,
      strategyId: form.strategyId,
      strategyVersion: form.strategyVersion ? Number(form.strategyVersion) : null,
      walletId: form.walletId,
      config: form.config,
      autoStart: form.autoStart,
    });
    if (!res.ok) throw new Error(res.error);
    emit('changed');
    await refresh();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    creating.value = false;
  }
}

watch(
  () => props.accounts,
  () => setDefaults(),
  { immediate: true },
);

watch(
  () => form.strategyId,
  () => {
    form.strategyVersion = '';
    void loadVersions();
  },
);

watch(
  () => [props.marketId, props.marketTitle],
  () => {
    form.name = '';
    lastDefaultName.value = '';
    void refresh();
  },
);

onMounted(refresh);
</script>

<template>
  <section class="flex min-h-0 flex-col">
    <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
      <p v-if="error" class="text-sm text-red-400">{{ error }}</p>

      <div class="space-y-3">
        <label class="block">
          <span class="text-muted text-xs">{{ t('common.name') }}</span>
          <input
            v-model="form.name"
            class="border-border bg-surface text-text mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none"
          />
        </label>

        <label class="block">
          <span class="text-muted text-xs">{{ t('common.strategy') }}</span>
          <select
            v-model="form.strategyId"
            class="border-border bg-surface text-text mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none"
          >
            <option v-for="strategy in strategies" :key="strategy.id" :value="strategy.id">
              {{ strategy.name }} v{{ strategy.currentVersion }}
            </option>
          </select>
        </label>

        <label class="block">
          <span class="text-muted text-xs">{{ t('common.version') }}</span>
          <select
            v-model="form.strategyVersion"
            class="border-border bg-surface text-text mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none"
          >
            <option v-for="version in versions" :key="version.id" :value="String(version.version)">
              v{{ version.version }} · {{ version.compileStatus }}
            </option>
          </select>
        </label>

        <WalletSelect
          v-model="form.walletId"
          :accounts="accounts"
          :disabled="tradableAccounts.length === 0"
        />

        <label class="block">
          <span class="text-muted text-xs">{{ t('bot.configJson') }}</span>
          <textarea
            v-model="form.config"
            spellcheck="false"
            class="border-border bg-surface text-text mt-1 h-24 w-full resize-none rounded-md border px-3 py-2 font-mono text-xs outline-none"
          />
        </label>

        <label class="text-muted-light inline-flex items-center gap-2 text-sm">
          <input v-model="form.autoStart" type="checkbox" class="accent-primary" />
          {{ t('bot.autoStart') }}
        </label>

        <div>
          <button
            type="button"
            class="border-border text-text inline-flex w-full items-center justify-center gap-2 rounded-md border bg-[#1e1e35] px-3 py-2 text-sm transition-colors hover:bg-[#2a2a45] disabled:opacity-50"
            :disabled="
              creating ||
              !props.conditionId ||
              !props.selectedTokenId ||
              !form.strategyId ||
              !form.walletId
            "
            @click="createBot"
          >
            <LoadingSpinner v-if="creating" :size="14" :title="t('tradingWindow.createBot')" />
            <Bot v-else :size="14" />
            {{ t('common.create') }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
