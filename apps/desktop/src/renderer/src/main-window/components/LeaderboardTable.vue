<script setup lang="ts">
import { UserRound } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import type {
  PublicTraderLeaderboardEntry,
  PublicTraderLeaderboardOrderBy,
} from '@polytrader/shared';
import { formatAddress, formatUsd } from '@/shared/utils/format';

const props = defineProps<{
  entries: PublicTraderLeaderboardEntry[];
  orderBy: PublicTraderLeaderboardOrderBy;
}>();

const emit = defineEmits<{
  sort: [value: PublicTraderLeaderboardOrderBy];
  'open-trader': [entry: PublicTraderLeaderboardEntry];
}>();

const { t } = useI18n();

const columns: Array<{
  field: 'rank' | 'trader' | PublicTraderLeaderboardOrderBy;
  labelKey: string;
  align: 'left' | 'right';
  sortable?: boolean;
}> = [
  { field: 'rank', labelKey: 'leaderboard.rank', align: 'left' },
  { field: 'trader', labelKey: 'leaderboard.trader', align: 'left' },
  { field: 'PNL', labelKey: 'leaderboard.pnl', align: 'right', sortable: true },
  { field: 'VOL', labelKey: 'leaderboard.volume', align: 'right', sortable: true },
];

function compactName(value: string): string {
  if (value.length <= 24) return value;
  return `${value.slice(0, 12)}…${value.slice(-11)}`;
}

function displayName(entry: PublicTraderLeaderboardEntry): string {
  return compactName(entry.userName || formatAddress(entry.proxyWallet));
}

function signedUsd(value: number): string {
  const amount = formatUsd(Math.abs(value));
  if (value === 0) return amount;
  return `${value > 0 ? '+' : '-'}${amount}`;
}

function isSortable(
  field: (typeof columns)[number]['field'],
): field is PublicTraderLeaderboardOrderBy {
  return field === 'PNL' || field === 'VOL';
}

function thClass(column: (typeof columns)[number]): string {
  const align = column.align === 'right' ? 'text-right' : 'text-left';
  const sorted = isSortable(column.field) && props.orderBy === column.field;
  const sortIcon = sorted
    ? 'after:ml-1 after:text-[10px] after:text-primary after:content-["▼"]'
    : '';
  const interaction = column.sortable
    ? 'cursor-pointer select-none transition-colors hover:bg-[#22223a] hover:text-[#ccc]'
    : '';
  return `bg-surface border-b border-border px-4 py-2.5 text-xs font-semibold uppercase text-muted ${align} ${sortIcon} ${interaction}`;
}

function sortLabel(column: (typeof columns)[number]): string {
  const label = t(column.labelKey);
  return column.sortable ? `${label}, ${t('leaderboard.orderBy')}` : label;
}

function handleSort(field: (typeof columns)[number]['field']): void {
  if (isSortable(field)) emit('sort', field);
}
</script>

<template>
  <div class="min-h-0 flex-1 overflow-auto">
    <table class="w-full border-collapse">
      <thead class="bg-surface sticky top-0 z-10">
        <tr>
          <th
            v-for="column in columns"
            :key="column.field"
            :class="thClass(column)"
            :aria-label="sortLabel(column)"
            :aria-sort="
              isSortable(column.field) && orderBy === column.field ? 'descending' : 'none'
            "
            @click="handleSort(column.field)"
          >
            {{ t(column.labelKey) }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="!entries.length">
          <td colspan="4" class="text-muted px-4 py-12 text-center text-sm">
            {{ t('leaderboard.noTraders') }}
          </td>
        </tr>
        <tr
          v-for="entry in entries"
          :key="`${entry.rank}:${entry.proxyWallet}`"
          class="border-border/60 border-b hover:bg-[#1a1a2e]"
        >
          <td class="text-muted w-20 px-4 py-3 text-sm font-medium tabular-nums">
            {{ entry.rank }}
          </td>
          <td class="px-4 py-3">
            <button
              type="button"
              class="group flex min-w-0 cursor-pointer items-center gap-2.5 text-left"
              :title="entry.userName || entry.proxyWallet"
              @click="emit('open-trader', entry)"
            >
              <img
                v-if="entry.profileImage"
                :src="entry.profileImage"
                alt=""
                class="border-border h-8 w-8 shrink-0 rounded-full border object-cover"
              />
              <span
                v-else
                class="bg-btn-secondary text-muted border-border inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border"
              >
                <UserRound :size="15" />
              </span>
              <span class="min-w-0">
                <span
                  class="text-text group-hover:text-primary-light flex items-center gap-1 truncate text-sm font-medium"
                >
                  {{ displayName(entry) }}
                  <span v-if="entry.verifiedBadge" class="text-primary-light text-xs">✓</span>
                </span>
                <span class="text-muted block truncate font-mono text-xs">
                  {{ entry.xUsername ? `@${entry.xUsername}` : formatAddress(entry.proxyWallet) }}
                </span>
              </span>
            </button>
          </td>
          <td
            class="px-4 py-3 text-right text-sm font-medium tabular-nums"
            :class="entry.pnl >= 0 ? 'text-green-400' : 'text-red-400'"
          >
            {{ signedUsd(entry.pnl) }}
          </td>
          <td class="text-text px-4 py-3 text-right text-sm tabular-nums">
            {{ formatUsd(entry.volume) }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
