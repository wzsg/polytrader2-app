<script setup lang="ts">
import { ArrowRightToLine } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import TitleBar from '../shared/components/TitleBar.vue';
import LoadingSpinner from '../shared/components/LoadingSpinner.vue';
import EventMarketsSidebar from '../main-window/components/EventMarketsSidebar.vue';
import TradingSidePanel from './components/TradingSidePanel.vue';
import TradingActivityTabs from './components/activity-tabs/TradingActivityTabs.vue';
import TradingCenterTabs from './components/center-tabs/TradingCenterTabs.vue';
import { useTradingApp } from './composables/useTradingApp';

const { t } = useI18n();

const {
  walletConfigured,
  walletDataError,
  accounts,
  activeActivityTab,
  activeCenterTab,
  activeTradeTab,
  cancelOrder,
  cancelOrders,
  cancelingOrderIds,
  conditionId,
  cryptoTick,
  defaultMarketTrades,
  defaultMarketTradesSyncStatus,
  deleteFailedOrder,
  displayBooks,
  error,
  event,
  eventError,
  eventId,
  eventLoading,
  eventMarkets,
  eventTitle,
  filteredWalletTrades,
  filteredOrders,
  filteredPositions,
  getCollapsedMarketIcon,
  getCollapsedMarketStatusClass,
  getCollapsedMarketStatusTitle,
  getCollapsedMarketTitle,
  handleOrderBookSpreadChange,
  handleOrderBookTickChange,
  handleOrderSubmitted,
  handleStrategyChanged,
  handleStrategyRunSelected,
  holders,
  leftPanelCollapsed,
  liveDepthLabel,
  market,
  marketDetailPending,
  marketDetailReady,
  marketIcon,
  marketId,
  marketNegRisk,
  marketTradesTotal,
  orderBookDepth,
  panelError,
  panelGridStyle,
  panelLoading,
  priceHistory,
  priceHistoryLoading,
  priceHistoryRange,
  requestTradingWindowClose,
  rightPanelCollapsed,
  selectedPanelWalletId,
  selectedStrategyRunId,
  selectedTokenId,
  selectMarket,
  setCollapsedMarketRef,
  showInitialMarketError,
  showInitialMarketLoading,
  showMarketSidebar,
  spreadLabel,
  startPanelWidthResize,
  startupError,
  strategyActivityError,
  strategyActivityLoading,
  strategyHistory,
  strategyLogs,
  strategyOrderIdList,
  tickSizeLabel,
  title,
  toggleLeftPanel,
  toggleRightPanel,
  tokenOutcomes,
  wsStatus,
  wsStatusLabel,
} = useTradingApp();
</script>

<template>
  <div class="flex h-full flex-col">
    <TitleBar
      title="Polytrader2"
      :subtitle="eventTitle"
      show-brand-icon
      pinnable
      custom-close
      @close="requestTradingWindowClose"
    />

    <main class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        v-if="showInitialMarketLoading"
        class="text-muted flex flex-1 items-center justify-center"
      >
        <LoadingSpinner :size="18" :title="t('tradingWindow.loadMarket')" />
      </div>

      <div
        v-else-if="showInitialMarketError"
        class="flex flex-1 items-center justify-center px-6 text-red-400"
      >
        {{ startupError || error }}
      </div>

      <div
        v-else
        class="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_var(--right-panel-width)]"
        :class="
          showMarketSidebar
            ? 'xl:grid-cols-[var(--left-panel-width)_minmax(0,1fr)_var(--right-panel-width)]'
            : 'xl:grid-cols-[minmax(0,1fr)_var(--right-panel-width)]'
        "
        :style="panelGridStyle"
      >
        <aside
          v-if="showMarketSidebar"
          class="border-border bg-detail-bg relative hidden min-h-0 flex-col overflow-hidden border-r xl:flex"
        >
          <div
            v-if="!leftPanelCollapsed"
            class="group absolute top-0 right-0 z-10 h-full w-2 cursor-col-resize"
            :title="t('tradingWindow.resizeCurrentMarketPanel')"
            @mousedown.prevent="startPanelWidthResize('left', $event)"
          >
            <div
              class="group-hover:bg-primary/70 ml-auto h-full w-0.5 bg-transparent transition-colors"
            />
          </div>

          <div v-if="leftPanelCollapsed" class="flex min-h-0 flex-1 flex-col items-center">
            <button
              type="button"
              class="hover:bg-btn-secondary text-muted-light border-border inline-flex h-8 w-full shrink-0 items-center justify-center border-b transition-colors hover:text-white"
              :title="t('tradingWindow.expandMarketPanel')"
              @click="toggleLeftPanel"
            >
              <ArrowRightToLine :size="16" />
            </button>

            <div
              v-if="eventLoading"
              class="flex flex-1 items-center justify-center"
              :title="t('market.loadEventMarkets')"
              :aria-label="t('market.loadEventMarkets')"
            >
              <LoadingSpinner :size="18" />
            </div>

            <div
              v-else
              class="scrollbar-hidden flex min-h-0 w-full flex-1 flex-col items-center gap-2 overflow-y-auto py-2"
            >
              <button
                v-for="item in eventMarkets"
                :key="item.id"
                :ref="(el) => setCollapsedMarketRef(String(item.id), el)"
                type="button"
                class="relative inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border transition-colors"
                :class="
                  String(item.id) === String(marketId)
                    ? 'border-primary bg-primary/20'
                    : 'hover:border-border hover:bg-btn-secondary border-transparent'
                "
                :title="getCollapsedMarketTitle(item)"
                :aria-label="getCollapsedMarketTitle(item)"
                :aria-current="String(item.id) === String(marketId) ? 'true' : undefined"
                @click="selectMarket(String(item.id))"
              >
                <span
                  class="relative h-7 w-7"
                  :title="getCollapsedMarketStatusTitle(item)"
                  :aria-label="getCollapsedMarketStatusTitle(item)"
                >
                  <img
                    v-if="getCollapsedMarketIcon(item)"
                    :src="getCollapsedMarketIcon(item)"
                    alt=""
                    class="h-7 w-7 rounded-md object-cover"
                    loading="lazy"
                  />
                  <span v-else class="bg-btn-secondary block h-7 w-7 rounded-md" />
                </span>
                <span
                  class="border-detail-bg absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2"
                  :class="getCollapsedMarketStatusClass(item)"
                  :title="getCollapsedMarketStatusTitle(item)"
                  :aria-label="getCollapsedMarketStatusTitle(item)"
                />
                <span
                  v-if="String(item.id) === String(marketId)"
                  class="bg-primary absolute top-1/2 -right-0.5 h-1.5 w-1.5 -translate-y-1/2 rounded-full"
                />
              </button>
            </div>
          </div>

          <!-- Expanded left rail reuses the main-window event market list. -->
          <div v-else class="flex min-h-0 flex-1 flex-col overflow-hidden">
            <section v-if="eventId" class="min-h-0 flex-1 overflow-hidden">
              <EventMarketsSidebar
                :event="event"
                :active-market-id="marketId"
                :loading="eventLoading"
                :error="eventError"
                collapsible
                @collapse="toggleLeftPanel"
                @select-market="selectMarket"
              />
            </section>
          </div>
        </aside>

        <!-- Center workspace: tabs, market content, and account/strategy activity. -->
        <section class="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <TradingCenterTabs
            v-model:active-tab="activeCenterTab"
            v-model:order-book-depth="orderBookDepth"
            v-model:price-history-range="priceHistoryRange"
            :market-id="marketId"
            :condition-id="conditionId"
            :market-detail-ready="marketDetailReady"
            :market-detail-pending="marketDetailPending"
            :error="error"
            :token-outcomes="tokenOutcomes"
            :holders="holders"
            :crypto-tick="cryptoTick"
            :price-history="priceHistory"
            :price-history-loading="priceHistoryLoading"
            :default-market-trades="defaultMarketTrades"
            :default-market-trades-sync-status="defaultMarketTradesSyncStatus"
            :display-books="displayBooks"
            :ws-status="wsStatus"
            :ws-status-label="wsStatusLabel"
            @market-trades-total-change="marketTradesTotal = $event"
            @spread-change="handleOrderBookSpreadChange"
            @tick-change="handleOrderBookTickChange"
          />

          <!-- Bottom activity area: account data plus strategy logs and history. -->
          <TradingActivityTabs
            v-model:active-tab="activeActivityTab"
            :orders="filteredOrders"
            :canceling-order-ids="cancelingOrderIds"
            :strategy-order-ids="strategyOrderIdList"
            :positions="filteredPositions"
            :accounts="accounts"
            :selected-wallet-id="selectedPanelWalletId"
            :condition-id="conditionId"
            :market-neg-risk="marketNegRisk"
            :positions-loading="panelLoading"
            :positions-error="walletDataError"
            :wallet-trades="filteredWalletTrades"
            :wallet-trades-loading="panelLoading"
            :wallet-trades-error="walletDataError"
            :strategy-logs="strategyLogs"
            :strategy-history="strategyHistory"
            :strategy-activity-loading="strategyActivityLoading"
            :strategy-activity-error="strategyActivityError"
            :selected-strategy-run-id="selectedStrategyRunId"
            :event-id="eventId"
            :market-id="marketId"
            @cancel-order="cancelOrder"
            @cancel-orders="cancelOrders"
            @delete-failed-order="deleteFailedOrder"
            @select-strategy-run="handleStrategyRunSelected"
            @bot-changed="handleStrategyChanged"
          />
        </section>

        <!-- Right trading panel: market summary, manual order entry, and bot setup. -->
        <TradingSidePanel
          v-model:active-trade-tab="activeTradeTab"
          v-model:selected-panel-wallet-id="selectedPanelWalletId"
          :right-panel-collapsed="rightPanelCollapsed"
          :market="market"
          :market-icon="marketIcon"
          :market-id="marketId"
          :condition-id="conditionId"
          :title="title"
          :live-depth-label="liveDepthLabel"
          :spread-label="spreadLabel"
          :tick-size-label="tickSizeLabel"
          :panel-error="panelError"
          :market-detail-ready="marketDetailReady"
          :market-detail-pending="marketDetailPending"
          :error="error"
          :token-outcomes="tokenOutcomes"
          :selected-token-id="selectedTokenId"
          :display-books="displayBooks"
          :positions="filteredPositions"
          :accounts="accounts"
          :wallet-configured="walletConfigured"
          :panel-loading="panelLoading"
          @start-resize="startPanelWidthResize"
          @toggle="toggleRightPanel"
          @order-submitted="handleOrderSubmitted"
          @strategy-changed="handleStrategyChanged"
        />
      </div>
    </main>
  </div>
</template>
