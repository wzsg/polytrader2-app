<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { FileClock, RefreshCw, ShoppingCart, Workflow } from '@lucide/vue';
import type {
  DeveloperOrderRecord,
  McpServerAccessLogRecord,
  WorkflowTaskRecord,
} from '@polytrader/shared';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';
import { formatTimestamp } from '@/shared/utils/format';

type DeveloperSection = 'mcpLogs' | 'orderRecords' | 'workflowTasks';

const { t } = useI18n();
const activeSection = ref<DeveloperSection>('mcpLogs');
const mcpLogs = ref<McpServerAccessLogRecord[]>([]);
const orderRecords = ref<DeveloperOrderRecord[]>([]);
const workflowTasks = ref<WorkflowTaskRecord[]>([]);
const loading = ref(false);
const error = ref('');

const sectionItems: Array<{ id: DeveloperSection; labelKey: string; icon: unknown }> = [
  { id: 'mcpLogs', labelKey: 'developer.mcpLogs', icon: FileClock },
  { id: 'orderRecords', labelKey: 'developer.orderRecords', icon: ShoppingCart },
  { id: 'workflowTasks', labelKey: 'developer.workflowLogs', icon: Workflow },
];

function sectionClass(section: DeveloperSection): string {
  return activeSection.value === section
    ? 'bg-primary/20 text-primary-light'
    : 'text-muted-light hover:bg-[#1e1e35] hover:text-white';
}

function boolLabel(value: boolean): string {
  return value ? t('common.yes') : t('common.no');
}

function text(value: unknown): string {
  const normalized = String(value ?? '').trim();
  return normalized || '-';
}

function timestamp(value: string | number | null): string {
  if (value == null || value === '') return '-';
  return formatTimestamp(String(value));
}

function duration(startedAt: string | null, finishedAt: string | null): string {
  if (startedAt == null || startedAt === '') return '-';
  const startMs = Date.parse(startedAt);
  if (!Number.isFinite(startMs)) return '-';
  const endMs =
    finishedAt != null && finishedAt !== '' && Number.isFinite(Date.parse(finishedAt))
      ? Date.parse(finishedAt)
      : Date.now();
  const durationMs = endMs - startMs;
  if (!Number.isFinite(durationMs) || durationMs < 0) return '-';
  if (durationMs < 1_000) return `${durationMs} ms`;
  if (durationMs < 60_000) return `${(durationMs / 1_000).toFixed(1)} s`;

  const totalSeconds = Math.floor(durationMs / 1_000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const parts = [minutes, seconds].map((value) => String(value).padStart(2, '0'));
  return hours > 0 ? `${String(hours).padStart(2, '0')}:${parts.join(':')}` : parts.join(':');
}

function truncate(value: unknown, max = 80): string {
  const normalized = text(value);
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function shortId(value: unknown): string {
  const normalized = text(value);
  if (normalized === '-' || normalized.length <= 18) return normalized;
  return `${normalized.slice(0, 10)}...${normalized.slice(-6)}`;
}

function workflowStatusBadgeClass(status: WorkflowTaskRecord['status']): string {
  switch (status) {
    case 'succeeded':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
    case 'failed':
    case 'canceled':
      return 'border-red-500/30 bg-red-500/10 text-red-300';
    case 'retry_scheduled':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
    default:
      return 'border-primary/30 bg-primary/10 text-primary-light';
  }
}

async function loadActiveSection(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    if (activeSection.value === 'mcpLogs') {
      mcpLogs.value = await window.api.listDeveloperMcpAccessLogs();
    } else if (activeSection.value === 'orderRecords') {
      orderRecords.value = await window.api.listDeveloperOrderRecords();
    } else {
      workflowTasks.value = await window.api.listDeveloperWorkflowTasks();
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

async function selectSection(section: DeveloperSection): Promise<void> {
  activeSection.value = section;
  await loadActiveSection();
}

onMounted(() => {
  void loadActiveSection();
});
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div
      class="border-border bg-surface flex h-12 shrink-0 items-center justify-between gap-3 border-b px-4"
    >
      <div
        class="border-border bg-bg inline-flex min-w-0 items-center gap-1 rounded-md border p-1"
        :aria-label="t('developer.navigation')"
      >
        <button
          v-for="item in sectionItems"
          :key="item.id"
          type="button"
          class="inline-flex h-8 items-center gap-2 rounded px-3 text-sm transition-colors"
          :class="sectionClass(item.id)"
          :title="t(item.labelKey)"
          :aria-pressed="activeSection === item.id"
          @click="selectSection(item.id)"
        >
          <component :is="item.icon" :size="15" />
          <span>{{ t(item.labelKey) }}</span>
        </button>
      </div>

      <button
        type="button"
        class="hover:bg-btn-secondary text-muted-light inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:text-white disabled:opacity-50"
        :title="t('common.refresh')"
        :aria-label="t('common.refresh')"
        :disabled="loading"
        @click="loadActiveSection"
      >
        <RefreshCw :size="15" :class="{ 'animate-spin': loading }" />
      </button>
    </div>

    <section class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <p v-if="error" class="border-border shrink-0 border-b px-4 py-2 text-sm text-red-400">
        {{ error }}
      </p>
      <div class="min-h-0 flex-1 overflow-auto p-4">
        <div v-if="loading" class="flex min-h-40 items-center">
          <LoadingSpinner :title="t('common.loading')" />
        </div>

        <div v-else-if="activeSection === 'mcpLogs'" class="overflow-x-auto">
          <table class="w-full min-w-[1200px] border-collapse text-left text-sm">
            <thead class="text-muted border-border border-b text-xs uppercase">
              <tr>
                <th class="px-3 py-2">{{ t('developer.createdAt') }}</th>
                <th class="px-3 py-2">{{ t('developer.method') }}</th>
                <th class="px-3 py-2">{{ t('developer.statusCode') }}</th>
                <th class="px-3 py-2">{{ t('developer.rpcMethod') }}</th>
                <th class="px-3 py-2">{{ t('developer.toolName') }}</th>
                <th class="px-3 py-2">{{ t('developer.resourceUri') }}</th>
                <th class="px-3 py-2">{{ t('developer.durationMs') }}</th>
                <th class="px-3 py-2">{{ t('developer.success') }}</th>
                <th class="px-3 py-2">{{ t('developer.errorMessage') }}</th>
                <th class="px-3 py-2">{{ t('developer.sessionId') }}</th>
                <th class="px-3 py-2">{{ t('developer.clientHost') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="mcpLogs.length === 0">
                <td class="text-muted px-3 py-6" colspan="11">{{ t('common.noData') }}</td>
              </tr>
              <tr
                v-for="log in mcpLogs"
                :key="log.id"
                class="border-border/70 hover:bg-detail-bg border-b align-top"
              >
                <td class="px-3 py-2 whitespace-nowrap">{{ timestamp(log.createdAt) }}</td>
                <td class="px-3 py-2 font-mono text-xs">{{ log.method }}</td>
                <td class="px-3 py-2">{{ text(log.statusCode) }}</td>
                <td class="px-3 py-2 font-mono text-xs">{{ text(log.rpcMethod) }}</td>
                <td class="px-3 py-2 font-mono text-xs">{{ text(log.toolName) }}</td>
                <td class="px-3 py-2 font-mono text-xs" :title="text(log.resourceUri)">
                  {{ truncate(log.resourceUri) }}
                </td>
                <td class="px-3 py-2">{{ text(log.durationMs) }}</td>
                <td class="px-3 py-2">{{ boolLabel(log.success) }}</td>
                <td class="px-3 py-2" :title="text(log.errorMessage)">
                  {{ truncate(log.errorMessage) }}
                </td>
                <td class="px-3 py-2 font-mono text-xs" :title="text(log.sessionId)">
                  {{ truncate(log.sessionId, 32) }}
                </td>
                <td class="px-3 py-2">{{ text(log.clientHost) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else-if="activeSection === 'orderRecords'" class="overflow-x-auto">
          <table class="w-full min-w-[1800px] table-fixed border-collapse text-left text-sm">
            <colgroup>
              <col class="w-36" />
              <col class="w-36" />
              <col class="w-40" />
              <col class="w-40" />
              <col class="w-24" />
              <col class="w-20" />
              <col class="w-48" />
              <col class="w-48" />
              <col class="w-20" />
              <col class="w-20" />
              <col class="w-20" />
              <col class="w-16" />
              <col class="w-36" />
              <col class="w-44" />
              <col class="w-52" />
              <col class="w-52" />
            </colgroup>
            <thead class="text-muted border-border border-b text-xs uppercase">
              <tr>
                <th class="truncate px-3 py-2">{{ t('developer.updatedAt') }}</th>
                <th class="truncate px-3 py-2">{{ t('common.account') }}</th>
                <th class="truncate px-3 py-2">{{ t('developer.orderId') }}</th>
                <th class="truncate px-3 py-2">{{ t('developer.exchangeOrderId') }}</th>
                <th class="truncate px-3 py-2">{{ t('common.status') }}</th>
                <th class="truncate px-3 py-2">{{ t('trade.direction') }}</th>
                <th class="truncate px-3 py-2">{{ t('order.market') }}</th>
                <th class="truncate px-3 py-2">{{ t('developer.assetId') }}</th>
                <th class="truncate px-3 py-2">{{ t('common.price') }}</th>
                <th class="truncate px-3 py-2">{{ t('common.quantity') }}</th>
                <th class="truncate px-3 py-2">{{ t('common.amount') }}</th>
                <th class="truncate px-3 py-2">{{ t('developer.active') }}</th>
                <th class="truncate px-3 py-2">{{ t('developer.submittedAt') }}</th>
                <th class="truncate px-3 py-2">{{ t('developer.errorMessage') }}</th>
                <th class="truncate px-3 py-2">{{ t('developer.requestJson') }}</th>
                <th class="truncate px-3 py-2">{{ t('developer.responseJson') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="orderRecords.length === 0">
                <td class="text-muted px-3 py-6" colspan="16">{{ t('common.noData') }}</td>
              </tr>
              <tr
                v-for="order in orderRecords"
                :key="`${order.walletId}:${order.orderId}`"
                class="border-border/70 hover:bg-detail-bg border-b align-middle"
              >
                <td class="truncate px-3 py-2 whitespace-nowrap">
                  {{ timestamp(order.updatedAt) }}
                </td>
                <td class="truncate px-3 py-2 font-mono text-xs" :title="text(order.walletId)">
                  {{ shortId(order.walletId) }}
                </td>
                <td class="truncate px-3 py-2 font-mono text-xs" :title="order.orderId">
                  {{ shortId(order.orderId) }}
                </td>
                <td
                  class="truncate px-3 py-2 font-mono text-xs"
                  :title="text(order.exchangeOrderId)"
                >
                  {{ shortId(order.exchangeOrderId) }}
                </td>
                <td class="truncate px-3 py-2">{{ text(order.status) }}</td>
                <td class="truncate px-3 py-2">{{ text(order.side) }}</td>
                <td class="truncate px-3 py-2 font-mono text-xs" :title="text(order.conditionId)">
                  {{ shortId(order.conditionId) }}
                </td>
                <td class="truncate px-3 py-2 font-mono text-xs" :title="text(order.assetId)">
                  {{ shortId(order.assetId) }}
                </td>
                <td class="truncate px-3 py-2">{{ text(order.price) }}</td>
                <td class="truncate px-3 py-2">{{ text(order.shares) }}</td>
                <td class="truncate px-3 py-2">{{ text(order.amount) }}</td>
                <td class="truncate px-3 py-2">{{ boolLabel(order.active) }}</td>
                <td class="truncate px-3 py-2 whitespace-nowrap">
                  {{ timestamp(order.submittedAt) }}
                </td>
                <td class="truncate px-3 py-2" :title="text(order.errorMessage)">
                  {{ truncate(order.errorMessage) }}
                </td>
                <td class="truncate px-3 py-2 font-mono text-xs" :title="text(order.requestJson)">
                  {{ truncate(order.requestJson, 60) }}
                </td>
                <td class="truncate px-3 py-2 font-mono text-xs" :title="text(order.responseJson)">
                  {{ truncate(order.responseJson, 60) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else class="overflow-x-auto">
          <table class="w-full min-w-[1800px] table-fixed border-collapse text-left text-sm">
            <colgroup>
              <col class="w-40" />
              <col class="w-56" />
              <col class="w-32" />
              <col class="w-24" />
              <col class="w-44" />
              <col class="w-44" />
              <col class="w-44" />
              <col class="w-28" />
              <col class="w-52" />
              <col class="w-52" />
              <col class="w-52" />
            </colgroup>
            <thead class="text-muted border-border border-b text-xs uppercase">
              <tr>
                <th class="truncate px-3 py-2">{{ t('developer.updatedAt') }}</th>
                <th class="truncate px-3 py-2">{{ t('developer.workflowType') }}</th>
                <th class="truncate px-3 py-2">{{ t('common.status') }}</th>
                <th class="truncate px-3 py-2">{{ t('developer.attempts') }}</th>
                <th class="truncate px-3 py-2">{{ t('developer.nextRunAt') }}</th>
                <th class="truncate px-3 py-2">{{ t('developer.startedAt') }}</th>
                <th class="truncate px-3 py-2">{{ t('developer.finishedAt') }}</th>
                <th class="truncate px-3 py-2">{{ t('developer.durationMs') }}</th>
                <th class="truncate px-3 py-2">{{ t('developer.payloadJson') }}</th>
                <th class="truncate px-3 py-2">{{ t('developer.resultJson') }}</th>
                <th class="truncate px-3 py-2">{{ t('developer.errorMessage') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="workflowTasks.length === 0">
                <td class="text-muted px-3 py-6" colspan="11">{{ t('common.noData') }}</td>
              </tr>
              <tr
                v-for="task in workflowTasks"
                :key="task.id"
                class="border-border/70 hover:bg-detail-bg border-b align-middle"
              >
                <td class="truncate px-3 py-2 whitespace-nowrap">
                  {{ timestamp(task.updatedAt) }}
                </td>
                <td class="truncate px-3 py-2 font-mono text-xs" :title="task.type">
                  {{ task.type }}
                </td>
                <td class="truncate px-3 py-2">
                  <span
                    class="inline-flex items-center rounded border px-2 py-0.5 text-xs"
                    :class="workflowStatusBadgeClass(task.status)"
                  >
                    {{ text(task.status) }}
                  </span>
                </td>
                <td class="truncate px-3 py-2">{{ task.attemptCount }} / {{ task.maxAttempts }}</td>
                <td class="truncate px-3 py-2 whitespace-nowrap">
                  {{ timestamp(task.nextRunAt) }}
                </td>
                <td class="truncate px-3 py-2 whitespace-nowrap">
                  {{ timestamp(task.startedAt) }}
                </td>
                <td class="truncate px-3 py-2 whitespace-nowrap">
                  {{ timestamp(task.finishedAt) }}
                </td>
                <td class="truncate px-3 py-2 whitespace-nowrap">
                  {{ duration(task.startedAt, task.finishedAt) }}
                </td>
                <td class="truncate px-3 py-2 font-mono text-xs" :title="text(task.payloadJson)">
                  {{ truncate(task.payloadJson, 72) }}
                </td>
                <td class="truncate px-3 py-2 font-mono text-xs" :title="text(task.resultJson)">
                  {{ truncate(task.resultJson, 72) }}
                </td>
                <td class="truncate px-3 py-2" :title="text(task.errorMessage)">
                  {{ truncate(task.errorMessage) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </div>
</template>
