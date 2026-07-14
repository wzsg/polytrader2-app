<script setup lang="ts">
import type {
  MarketOutcome,
  OrderBook,
  PriceHistoryPoint,
  TradingMarketSnapshot,
} from '@polytrader/shared';
import type { PriceHistoryRange } from '../../composables/usePriceHistoryRange';
import {
  ORDER_BOOK_DEPTH_OPTIONS,
  type OrderBookDepthOption,
  type OrderBookSpreadChange,
  type OrderBookTickChange,
} from '../../composables/useTradingOrderBookSummary';
import OutcomePriceChart from './OutcomePriceChart.vue';
import TradingOrderBookPanel from './TradingOrderBookPanel.vue';
import CryptoTickPanel from './CryptoTickPanel.vue';
import BinanceKlinePanel from './BinanceKlinePanel.vue';

defineProps<{
  marketId: string;
  tokenOutcomes: MarketOutcome[];
  cryptoTick: TradingMarketSnapshot['cryptoTick'];
  binanceKline: TradingMarketSnapshot['binanceKline'];
  priceHistory: Record<string, PriceHistoryPoint[]>;
  priceHistoryLoading: boolean;
  priceHistoryRange: PriceHistoryRange;
  displayBooks: OrderBook[];
  orderBookDepth: OrderBookDepthOption;
  live: boolean;
}>();

const emit = defineEmits<{
  'update:orderBookDepth': [depth: OrderBookDepthOption];
  'update:priceHistoryRange': [range: PriceHistoryRange];
  spreadChange: [payload: OrderBookSpreadChange];
  tickChange: [payload: OrderBookTickChange];
}>();
</script>

<template>
  <div class="flex flex-col gap-4">
    <div v-if="binanceKline?.enabled" class="h-[420px] shrink-0 overflow-hidden">
      <BinanceKlinePanel :binance-kline="binanceKline" />
    </div>

    <div v-else-if="cryptoTick?.enabled" class="h-[420px] shrink-0 overflow-hidden">
      <CryptoTickPanel :crypto-tick="cryptoTick" />
    </div>

    <div v-else class="h-[420px] shrink-0 overflow-hidden">
      <OutcomePriceChart
        :key="`chart-${marketId}`"
        :market-id="marketId"
        :outcomes="tokenOutcomes"
        :price-history="priceHistory"
        :loading="priceHistoryLoading"
        :history-range="priceHistoryRange"
        @update:history-range="emit('update:priceHistoryRange', $event)"
      />
    </div>

    <div class="flex shrink-0 items-center justify-end">
      <div class="border-border bg-surface inline-flex rounded-md border p-0.5">
        <button
          v-for="option in ORDER_BOOK_DEPTH_OPTIONS"
          :key="option.value"
          type="button"
          class="min-w-12 rounded px-3 py-1.5 text-xs font-medium transition-colors"
          :class="
            orderBookDepth === option.value
              ? 'bg-primary text-white'
              : 'text-muted-light hover:bg-btn-secondary hover:text-white'
          "
          :aria-pressed="orderBookDepth === option.value"
          @click="emit('update:orderBookDepth', option.value)"
        >
          {{ option.label }}
        </button>
      </div>
    </div>

    <div class="shrink-0">
      <div class="grid gap-4 xl:grid-cols-2">
        <TradingOrderBookPanel
          v-for="book in displayBooks"
          :key="`${marketId}-${book.tokenId}`"
          :book="book"
          :depth-limit="orderBookDepth"
          :live="live"
          @spread-change="emit('spreadChange', $event)"
          @tick-change="emit('tickChange', $event)"
        />
      </div>
    </div>
  </div>
</template>
