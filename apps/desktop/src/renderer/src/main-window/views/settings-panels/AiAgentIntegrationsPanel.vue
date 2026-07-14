<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Plus, RefreshCw, Trash2 } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import type { AiAgentConfigState, AiAgentId, AiAgentIntegrationStatus } from '@polytrader/shared';
import claudeIconUrl from '@/assets/ai-agent/claude-ai-icon.png';
import codexIconUrl from '@/assets/ai-agent/codex-icon.png';
import cursorIconUrl from '@/assets/ai-agent/cursor-ai-code-icon.png';
import openCodeIconUrl from '@/assets/ai-agent/opencode.png';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';

const agentIconUrls: Record<AiAgentId, string> = {
  codex: codexIconUrl,
  'claude-desktop': claudeIconUrl,
  opencode: openCodeIconUrl,
  cursor: cursorIconUrl,
};

const statuses = ref<AiAgentIntegrationStatus[]>([]);
const loading = ref(false);
const operatingAgentId = ref<AiAgentId | null>(null);
const operationError = ref('');
const { t } = useI18n();

async function loadStatuses(): Promise<void> {
  loading.value = true;
  operationError.value = '';
  try {
    statuses.value = await window.api.aiAgentIntegrations.detectAll();
  } catch (error) {
    operationError.value = error instanceof Error ? error.message : String(error);
  } finally {
    loading.value = false;
  }
}

async function configureAgent(agentId: AiAgentId): Promise<void> {
  operatingAgentId.value = agentId;
  operationError.value = '';
  try {
    const status = await window.api.aiAgentIntegrations.configure(agentId);
    replaceStatus(status);
  } catch (error) {
    operationError.value = error instanceof Error ? error.message : String(error);
  } finally {
    operatingAgentId.value = null;
  }
}

async function removeAgent(agentId: AiAgentId): Promise<void> {
  if (!window.confirm(t('settings.aiAgentRemoveConfirm'))) return;
  operatingAgentId.value = agentId;
  operationError.value = '';
  try {
    const status = await window.api.aiAgentIntegrations.remove(agentId);
    replaceStatus(status);
  } catch (error) {
    operationError.value = error instanceof Error ? error.message : String(error);
  } finally {
    operatingAgentId.value = null;
  }
}

function replaceStatus(status: AiAgentIntegrationStatus): void {
  const index = statuses.value.findIndex((item) => item.id === status.id);
  if (index < 0) statuses.value.push(status);
  else statuses.value.splice(index, 1, status);
}

function statusLabel(state: AiAgentConfigState): string {
  return t(`settings.aiAgentState.${state}`);
}

function statusClass(status: AiAgentIntegrationStatus): string {
  if (!status.installed) return 'text-muted';
  if (status.configState === 'configured') return 'text-emerald-400';
  if (status.configState === 'error' || status.configState === 'conflict') return 'text-red-400';
  if (status.configState === 'update-required') return 'text-amber-400';
  return 'text-muted-light';
}

onMounted(loadStatuses);
</script>

<template>
  <div class="mt-6">
    <div class="mb-3 flex items-center justify-between gap-3">
      <div>
        <h2 class="text-sm font-semibold text-white">{{ t('settings.aiAgents') }}</h2>
        <p class="text-muted mt-1 text-sm">{{ t('settings.aiAgentsDescription') }}</p>
      </div>
      <button
        type="button"
        class="border-border text-muted-light hover:bg-btn-secondary inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors hover:text-white disabled:opacity-50"
        :title="t('settings.refreshAiAgents')"
        :aria-label="t('settings.refreshAiAgents')"
        :disabled="loading || operatingAgentId !== null"
        @click="loadStatuses"
      >
        <LoadingSpinner v-if="loading" :size="15" :title="t('settings.detectAiAgents')" />
        <RefreshCw v-else :size="15" />
      </button>
    </div>

    <div class="border-border bg-detail-bg overflow-hidden rounded-lg border">
      <div
        v-if="loading && statuses.length === 0"
        class="flex min-h-28 items-center justify-center px-5 py-6"
      >
        <LoadingSpinner :size="20" :title="t('settings.detectAiAgents')" />
      </div>
      <div
        v-for="(status, index) in statuses"
        :key="status.id"
        class="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
        :class="{ 'border-border border-t': index > 0 }"
      >
        <div class="flex min-w-0 items-start gap-3">
          <img
            :src="agentIconUrls[status.id]"
            :alt="status.displayName"
            class="mt-0.5 h-8 w-8 shrink-0 rounded-md object-cover"
            draggable="false"
          />
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <p class="text-sm font-medium text-white">{{ status.displayName }}</p>
              <span class="text-xs" :class="statusClass(status)">
                {{
                  status.installed
                    ? statusLabel(status.configState)
                    : t('settings.aiAgentNotInstalled')
                }}
              </span>
            </div>
            <p
              class="text-muted mt-1 truncate text-xs"
              :title="status.executablePath || status.configPath"
            >
              {{
                status.installed
                  ? `${status.version || t('settings.aiAgentVersionUnknown')} · ${status.executablePath}`
                  : t('settings.aiAgentInstallHint')
              }}
            </p>
            <p v-if="status.error" class="mt-1 text-xs text-red-400">{{ status.error }}</p>
            <p v-else-if="status.configState === 'configured'" class="text-muted mt-1 text-xs">
              {{ t('settings.aiAgentRestartHint') }}
            </p>
            <p v-else-if="status.configState === 'conflict'" class="mt-1 text-xs text-red-400">
              {{ t('settings.aiAgentConflictHint') }}
            </p>
          </div>
        </div>

        <div class="flex shrink-0 items-center gap-2">
          <LoadingSpinner
            v-if="operatingAgentId === status.id"
            :title="t('settings.configureAiAgent')"
          />
          <button
            v-if="status.configState === 'configured'"
            type="button"
            class="border-border text-text hover:bg-btn-secondary inline-flex h-8 items-center gap-2 rounded-md border px-3 text-sm transition-colors disabled:opacity-50"
            :disabled="operatingAgentId !== null"
            @click="removeAgent(status.id)"
          >
            <Trash2 :size="14" />
            {{ t('settings.removeAiAgentMcp') }}
          </button>
          <button
            v-else
            type="button"
            class="bg-primary hover:bg-primary-hover inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="
              !status.installed ||
              status.configState === 'conflict' ||
              status.configState === 'error' ||
              operatingAgentId !== null
            "
            @click="configureAgent(status.id)"
          >
            <Plus :size="14" />
            {{
              status.configState === 'update-required'
                ? t('settings.updateAiAgentMcp')
                : t('settings.addAiAgentMcp')
            }}
          </button>
        </div>
      </div>

      <div
        v-if="!loading && statuses.length === 0"
        class="text-muted px-5 py-6 text-center text-sm"
      >
        {{ t('settings.noAiAgentsDetected') }}
      </div>
    </div>

    <p v-if="operationError" class="mt-3 text-xs text-red-400">
      {{ t('settings.aiAgentOperationFailed', { error: operationError }) }}
    </p>
  </div>
</template>
