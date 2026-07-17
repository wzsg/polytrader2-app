<script setup lang="ts">
import type { HolderEntry, HolderGroup } from '@polytrader/shared';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';
import { useI18n } from 'vue-i18n';
import { formatAddress, formatNumber } from '@/shared/utils/format';

defineProps<{
  holders: HolderGroup[];
  marketDetailReady: boolean;
  marketDetailPending: boolean;
  error?: string;
}>();

const { t } = useI18n();

function holderName(holder: HolderEntry): string {
  if (holder.name) return holder.name;
  if (holder.pseudonym) return holder.pseudonym;
  return formatAddress(holder.proxyWallet);
}

function compactHolderName(holder: HolderEntry): string {
  const name = holderName(holder);
  const maxLength = 24;
  if (name.length <= maxLength) return name;

  const prefixLength = 12;
  const suffixLength = maxLength - prefixLength - 1;
  return `${name.slice(0, prefixLength)}…${name.slice(-suffixLength)}`;
}
</script>

<template>
  <section class="flex flex-col gap-3">
    <div class="flex items-center">
      <h2 class="text-sm font-semibold text-white">{{ t('tradingWindow.holdersTitle') }}</h2>
    </div>

    <div
      v-if="!marketDetailReady"
      class="border-border bg-detail-bg flex min-h-[260px] items-center justify-center border"
    >
      <LoadingSpinner
        v-if="marketDetailPending || !error"
        :size="18"
        :title="t('tradingWindow.loadHolders')"
      />
      <p v-else class="px-6 text-center text-sm text-red-400">{{ error }}</p>
    </div>

    <div v-else class="grid gap-4 xl:grid-cols-2">
      <div
        v-for="group in holders"
        :key="group.tokenId"
        class="border-border bg-detail-bg overflow-hidden rounded-lg border"
      >
        <div class="border-border border-b px-4 py-3">
          <h3 class="text-sm font-semibold text-white">{{ group.label }}</h3>
          <p class="text-muted mt-1 text-xs">
            {{ t('tradingWindow.topHolders', { count: group.holders.length }) }}
          </p>
        </div>

        <div class="overflow-auto">
          <table class="w-full border-collapse">
            <thead class="bg-surface sticky top-0">
              <tr>
                <th
                  class="border-border text-muted w-12 border-b px-3 py-2.5 text-left text-xs font-semibold uppercase"
                >
                  #
                </th>
                <th
                  class="border-border text-muted border-b px-3 py-2.5 text-left text-xs font-semibold uppercase"
                >
                  {{ t('tradingWindow.user') }}
                </th>
                <th
                  class="border-border text-muted border-b px-3 py-2.5 text-right text-xs font-semibold uppercase"
                >
                  {{ t('position.size') }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(holder, index) in group.holders"
                :key="`${holder.proxyWallet}-${index}`"
                class="border-border/40 border-b hover:bg-[#1a1a2e]"
              >
                <td class="text-muted px-3 py-2 text-sm">{{ index + 1 }}</td>
                <td class="text-text px-3 py-2 text-sm" :title="holderName(holder)">
                  {{ compactHolderName(holder) }}
                </td>
                <td class="text-text px-3 py-2 text-right text-sm tabular-nums">
                  {{ formatNumber(holder.amount, 2) }}
                </td>
              </tr>
              <tr v-if="!group.holders.length">
                <td colspan="3" class="text-muted px-3 py-6 text-center text-xs">
                  {{ t('tradingWindow.noHolders') }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </section>
</template>
