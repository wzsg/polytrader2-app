<script setup lang="ts">
import { computed } from 'vue';
import { ArrowLeftToLine, ArrowRightToLine } from '@lucide/vue';
import type {
  DataPosition,
  MarketOutcome,
  OrderBook,
  PolymarketWalletSummary,
} from '@polytrader/shared';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';
import { useI18n } from 'vue-i18n';
import { formatNum } from '@/shared/utils/format';
import BotMarketPanel from './BotMarketPanel.vue';
import OrderTicket from './OrderTicket.vue';

type TradeTab = 'manual' | 'strategy';

type TradingSidePanelMarket = {
  volume?: number | null;
  volume24hr?: number | null;
  liquidity?: number | null;
};

const props = defineProps<{
  activeTradeTab: TradeTab;
  rightPanelCollapsed: boolean;
  market: TradingSidePanelMarket | null;
  marketIcon: string;
  marketId: string;
  conditionId: string;
  title: string;
  liveDepthLabel: string;
  spreadLabel: string;
  tickSizeLabel: string;
  panelError: string;
  marketDetailReady: boolean;
  marketDetailPending: boolean;
  error: string;
  selectedPanelWalletId: string;
  tokenOutcomes: MarketOutcome[];
  selectedTokenId: string;
  displayBooks: OrderBook[];
  positions: DataPosition[];
  accounts: PolymarketWalletSummary[];
  walletConfigured: boolean;
  panelLoading: boolean;
}>();

const emit = defineEmits<{
  'update:activeTradeTab': [tab: TradeTab];
  'update:selectedPanelWalletId': [walletId: string];
  startResize: [side: 'right', event: MouseEvent];
  toggle: [];
  orderSubmitted: [];
  strategyChanged: [];
}>();

const { t } = useI18n();

const selectedPanelWalletIdModel = computed({
  get: () => props.selectedPanelWalletId,
  set: (walletId: string) => emit('update:selectedPanelWalletId', walletId),
});

function setActiveTradeTab(tab: TradeTab): void {
  emit('update:activeTradeTab', tab);
}

function startRightPanelResize(event: MouseEvent): void {
  emit('startResize', 'right', event);
}
</script>

<template>
  <aside class="border-border bg-detail-bg relative flex min-h-0 flex-col overflow-hidden border-l">
    <div
      v-if="!rightPanelCollapsed"
      class="group absolute top-0 left-0 z-10 h-full w-2 cursor-col-resize"
      :title="t('tradingWindow.resizeOrderPanel')"
      @mousedown.prevent="startRightPanelResize"
    >
      <div class="group-hover:bg-primary/70 h-full w-0.5 bg-transparent transition-colors" />
    </div>

    <div v-if="rightPanelCollapsed" class="flex flex-1 flex-col items-center gap-3 pt-3">
      <button
        type="button"
        class="border-border bg-detail-bg hover:bg-btn-secondary text-primary-light inline-flex h-9 w-9 items-center justify-center rounded-md border transition-colors"
        :title="t('tradingWindow.expandTradePanel')"
        @click="emit('toggle')"
      >
        <ArrowLeftToLine :size="16" />
      </button>
    </div>

    <div v-else class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <section class="border-border shrink-0 border-b p-3">
        <div class="flex min-w-0 items-start gap-2.5">
          <img
            v-if="marketIcon"
            :src="marketIcon"
            alt=""
            class="border-border h-10 w-10 shrink-0 rounded-md border object-cover"
            loading="lazy"
          />
          <div class="min-w-0 flex-1">
            <h3 class="text-sm leading-snug font-semibold break-words whitespace-normal text-white">
              {{ title }}
            </h3>
            <p class="text-muted mt-1 truncate text-xs">market id: {{ marketId }}</p>
          </div>
          <button
            type="button"
            class="hover:bg-btn-secondary text-muted-light -mt-1 -mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:text-white"
            :title="t('tradingWindow.collapseTradePanel')"
            @click="emit('toggle')"
          >
            <ArrowRightToLine :size="16" />
          </button>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <div class="min-w-0">
            <p class="text-muted text-xs">{{ t('common.volume') }}</p>
            <p class="text-primary-light mt-1 font-semibold">
              {{ market ? formatNum(market.volume) : '—' }}
            </p>
          </div>
          <div class="min-w-0">
            <p class="text-muted text-xs">24h</p>
            <p class="text-primary-light mt-1 font-semibold">
              {{ market ? formatNum(market.volume24hr) : '—' }}
            </p>
          </div>
          <div class="min-w-0">
            <p class="text-muted text-xs">{{ t('common.liquidity') }}</p>
            <p class="text-primary-light mt-1 font-semibold">
              {{ market ? formatNum(market.liquidity) : '—' }}
            </p>
          </div>
          <div class="min-w-0">
            <p class="text-muted text-xs">{{ t('common.depth') }}</p>
            <p
              class="text-primary-light mt-1 font-semibold"
              :title="t('tradingWindow.depthSummaryTitle')"
            >
              {{ liveDepthLabel }}
            </p>
          </div>
          <div class="min-w-0">
            <p class="text-muted text-xs">{{ t('common.spread') }}</p>
            <p class="text-primary-light mt-1 font-semibold">
              {{ spreadLabel }}
            </p>
          </div>
          <div class="min-w-0">
            <p class="text-muted text-xs">Tick</p>
            <p class="text-primary-light mt-1 font-semibold">
              {{ tickSizeLabel }}
            </p>
          </div>
        </div>
      </section>

      <div class="border-border flex border-b p-1">
        <button
          type="button"
          class="flex-1 px-3 py-2 text-sm font-medium transition-colors"
          :class="
            activeTradeTab === 'manual'
              ? 'bg-primary/20 text-primary-light'
              : 'text-muted-light hover:bg-btn-secondary hover:text-white'
          "
          @click="setActiveTradeTab('manual')"
        >
          {{ t('tradingWindow.manualTrading') }}
        </button>
        <button
          type="button"
          class="flex-1 px-3 py-2 text-sm font-medium transition-colors"
          :class="
            activeTradeTab === 'strategy'
              ? 'bg-primary/20 text-primary-light'
              : 'text-muted-light hover:bg-btn-secondary hover:text-white'
          "
          @click="setActiveTradeTab('strategy')"
        >
          {{ t('tradingWindow.automatedTrading') }}
        </button>
      </div>

      <div v-if="activeTradeTab === 'manual'" class="flex min-h-0 flex-1 flex-col">
        <div v-if="panelError" class="border-border border-b p-3 text-sm text-red-400">
          {{ panelError }}
        </div>
        <div v-if="!marketDetailReady" class="flex min-h-0 flex-1 items-center justify-center p-3">
          <LoadingSpinner
            v-if="marketDetailPending || !error"
            :size="18"
            :title="t('tradingWindow.loadTradingMarket')"
          />
          <p v-else class="text-center text-sm text-red-400">{{ error }}</p>
        </div>
        <OrderTicket
          v-else
          v-model:account-id="selectedPanelWalletIdModel"
          class="min-h-0 flex-1"
          :outcomes="tokenOutcomes"
          :selected-token-id="selectedTokenId"
          :order-books="displayBooks"
          :positions="positions"
          :accounts="accounts"
          :configured="walletConfigured"
          :accounts-loading="panelLoading"
          :positions-loading="panelLoading"
          @submitted="emit('orderSubmitted')"
        />
      </div>

      <template v-else>
        <div v-if="!marketDetailReady" class="flex min-h-0 flex-1 items-center justify-center p-3">
          <LoadingSpinner
            v-if="marketDetailPending || !error"
            :size="18"
            :title="t('tradingWindow.loadBotMarket')"
          />
          <p v-else class="text-center text-sm text-red-400">{{ error }}</p>
        </div>
        <BotMarketPanel
          v-else
          :key="`bot-panel-${marketId}`"
          class="min-h-0 flex-1"
          :market-id="marketId"
          :condition-id="conditionId"
          :market-title="title"
          :selected-token-id="selectedTokenId"
          :accounts="accounts"
          @changed="emit('strategyChanged')"
        />
      </template>
    </div>
  </aside>
</template>
