<script setup lang="ts">
import { computed } from 'vue';
import { BarChart3, ChartLine, ListOrdered, Users } from '@lucide/vue';
import type {
  HolderGroup,
  MarketOutcome,
  MarketTradeListResult,
  MarketTradeSyncStatus,
  OrderBook,
  PriceHistoryPoint,
  TradingMarketSnapshot,
} from '@polytrader/shared';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';
import { useI18n } from 'vue-i18n';
import type { PriceHistoryRange } from '../../composables/usePriceHistoryRange';
import {
  type OrderBookDepthOption,
  type OrderBookSpreadChange,
  type OrderBookTickChange,
} from '../../composables/useTradingOrderBookSummary';
import HoldersPanel from './HoldersPanel.vue';
import MarketPanel from './MarketPanel.vue';
import RecentTradesPanel from './RecentTradesPanel.vue';
import TradeAnalysisPanel from './TradeAnalysisPanel.vue';

type CenterTab = 'market' | 'trades' | 'analysis' | 'holders';
type WsStatus = 'disconnected' | 'connecting' | 'live' | 'error';

defineProps<{
  activeTab: CenterTab;
  marketId: string;
  conditionId: string;
  marketDetailReady: boolean;
  marketDetailPending: boolean;
  error?: string;
  tokenOutcomes: MarketOutcome[];
  holders: HolderGroup[];
  cryptoTick: TradingMarketSnapshot['cryptoTick'];
  priceHistory: Record<string, PriceHistoryPoint[]>;
  priceHistoryLoading: boolean;
  priceHistoryRange: PriceHistoryRange;
  defaultMarketTrades: MarketTradeListResult | null;
  defaultMarketTradesSyncStatus: MarketTradeSyncStatus | null;
  displayBooks: OrderBook[];
  orderBookDepth: OrderBookDepthOption;
  wsStatus: WsStatus;
  wsStatusLabel: string;
}>();

const emit = defineEmits<{
  'update:activeTab': [tab: CenterTab];
  'update:orderBookDepth': [depth: OrderBookDepthOption];
  'update:priceHistoryRange': [range: PriceHistoryRange];
  marketTradesTotalChange: [total: number];
  spreadChange: [payload: OrderBookSpreadChange];
  tickChange: [payload: OrderBookTickChange];
}>();

const { t } = useI18n();

const centerTabs = computed<
  Array<{
    id: CenterTab;
    label: string;
    icon: typeof ChartLine;
  }>
>(() => [
  { id: 'market', label: t('tradingWindow.marketTab'), icon: ChartLine },
  { id: 'trades', label: t('tradingWindow.recentTradesTab'), icon: ListOrdered },
  { id: 'analysis', label: t('tradingWindow.tradeAnalysisTab'), icon: BarChart3 },
  { id: 'holders', label: t('tradingWindow.holdersTab'), icon: Users },
]);

function centerTabCount(tab: CenterTab): string | number | null {
  if (tab === 'market') return null;
  if (tab === 'trades' || tab === 'analysis') return null;
  if (tab === 'holders') return null;
  return null;
}
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div
      class="border-border bg-detail-bg/95 flex h-11 shrink-0 items-stretch justify-between gap-3 border-b px-3"
    >
      <div class="flex min-w-0 items-stretch gap-1 overflow-x-auto">
        <button
          v-for="tab in centerTabs"
          :key="tab.id"
          type="button"
          class="relative inline-flex min-w-max items-center gap-2 px-3 text-sm font-medium transition-colors"
          :class="activeTab === tab.id ? 'text-primary-light' : 'text-muted-light hover:text-white'"
          @click="emit('update:activeTab', tab.id)"
        >
          <component :is="tab.icon" :size="15" />
          <span>{{ tab.label }}</span>
          <span
            v-if="centerTabCount(tab.id) !== null"
            class="rounded px-1.5 py-0.5 text-[11px] leading-none"
            :class="activeTab === tab.id ? 'bg-primary/20 text-primary-light' : 'bg-bg text-muted'"
          >
            {{ centerTabCount(tab.id) }}
          </span>
          <span
            v-if="activeTab === tab.id"
            class="bg-primary absolute right-2 bottom-0 left-2 h-0.5 rounded-full"
          />
        </button>
      </div>

      <div class="hidden shrink-0 items-center gap-2 text-xs sm:flex">
        <span
          class="inline-flex items-center gap-1.5"
          :class="wsStatus === 'live' ? 'text-green-400' : 'text-muted-light'"
        >
          <span
            class="inline-block h-1.5 w-1.5 rounded-full"
            :class="wsStatus === 'live' ? 'bg-green-400' : 'bg-muted'"
          />
          {{ wsStatusLabel }}
        </span>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-auto p-4">
      <div class="min-h-0 flex-1">
        <div v-if="activeTab === 'market'" class="flex flex-col gap-4">
          <template v-if="marketDetailReady">
            <MarketPanel
              :market-id="marketId"
              :token-outcomes="tokenOutcomes"
              :crypto-tick="cryptoTick"
              :price-history="priceHistory"
              :price-history-loading="priceHistoryLoading"
              :price-history-range="priceHistoryRange"
              :display-books="displayBooks"
              :order-book-depth="orderBookDepth"
              :live="wsStatus === 'live'"
              @update:price-history-range="emit('update:priceHistoryRange', $event)"
              @update:order-book-depth="emit('update:orderBookDepth', $event)"
              @spread-change="emit('spreadChange', $event)"
              @tick-change="emit('tickChange', $event)"
            />
          </template>

          <div
            v-else
            class="border-border bg-detail-bg flex min-h-[420px] flex-1 items-center justify-center border"
          >
            <LoadingSpinner
              v-if="marketDetailPending || !error"
              :size="18"
              :title="t('tradingWindow.loadMarket')"
            />
            <p v-else class="px-6 text-center text-sm text-red-400">{{ error }}</p>
          </div>
        </div>

        <template v-else-if="activeTab === 'trades'">
          <div
            v-if="!marketDetailReady"
            class="border-border bg-detail-bg flex min-h-[360px] flex-1 items-center justify-center border"
          >
            <LoadingSpinner
              v-if="marketDetailPending || !error"
              :size="18"
              :title="t('tradingWindow.loadRecentTrades')"
            />
            <p v-else class="px-6 text-center text-sm text-red-400">{{ error }}</p>
          </div>
          <RecentTradesPanel
            v-else
            :key="`trades-${marketId}`"
            embedded
            :market-id="marketId"
            :condition-id="conditionId"
            :outcomes="tokenOutcomes"
            :default-result="defaultMarketTrades"
            :default-sync-status="defaultMarketTradesSyncStatus"
            @total-change="emit('marketTradesTotalChange', $event)"
          />
        </template>

        <template v-else-if="activeTab === 'analysis'">
          <div
            v-if="!marketDetailReady"
            class="border-border bg-detail-bg flex min-h-[360px] flex-1 items-center justify-center border"
          >
            <LoadingSpinner
              v-if="marketDetailPending || !error"
              :size="18"
              :title="t('tradingWindow.loadTradeAnalysis')"
            />
            <p v-else class="px-6 text-center text-sm text-red-400">{{ error }}</p>
          </div>
          <TradeAnalysisPanel
            v-else
            :key="`analysis-${marketId}`"
            :market-id="marketId"
            :condition-id="conditionId"
            :outcomes="tokenOutcomes"
          />
        </template>

        <HoldersPanel
          v-else
          :holders="holders"
          :market-detail-ready="marketDetailReady"
          :market-detail-pending="marketDetailPending"
          :error="error"
        />
      </div>
    </div>
  </section>
</template>
