import { computed, ref, type Ref } from 'vue';
import type { OrderBook } from '@polytrader/shared';
import { translateUiKey } from '@/shared/i18n';
import { formatNum, formatPriceByTick } from '@/shared/utils/format';

export type OrderBookDepthOption = 10 | 20 | 50 | 'all';
export type OrderBookSpreadChange = { tokenId: string; spread: number | null; label: string };
export type OrderBookTickChange = { tokenId: string; tickSize: string | null };

export const ORDER_BOOK_DEPTH_OPTIONS: Array<{ label: string; value: OrderBookDepthOption }> = [
  { label: translateUiKey('tradingWindow.depth10'), value: 10 },
  { label: translateUiKey('tradingWindow.depth20'), value: 20 },
  { label: translateUiKey('tradingWindow.depth50'), value: 50 },
  { label: translateUiKey('common.all'), value: 'all' },
];

export function useTradingOrderBookSummary(
  orderBooks: Ref<OrderBook[]>,
  selectedTokenId: Ref<string>,
) {
  const orderBookDepth = ref<OrderBookDepthOption>(10);
  const liveSpreadLabels = ref<Record<string, string>>({});
  const liveTickSizes = ref<Record<string, string | null>>({});

  const selectedBook = computed(() => {
    if (!selectedTokenId.value) return orderBooks.value[0] ?? null;
    return orderBooks.value.find((item) => item.tokenId === selectedTokenId.value) ?? null;
  });
  const metricsBook = computed(() => selectedBook.value ?? orderBooks.value[0] ?? null);
  const spreadLabel = computed(() => {
    const book = metricsBook.value;
    if (!book) return '—';
    const liveLabel = liveSpreadLabels.value[book.tokenId];
    if (liveLabel) return liveLabel;
    return getOrderBookSpreadLabel(book);
  });
  const tickSizeLabel = computed(() => {
    const book = metricsBook.value ?? orderBooks.value.find((item) => item.tickSize);
    if (!book) return '—';
    return liveTickSizes.value[book.tokenId] ?? book.tickSize ?? '—';
  });
  const liveDepth = computed(() => (metricsBook.value ? getOrderBookDepth(metricsBook.value) : 0));
  const liveDepthLabel = computed(() => (liveDepth.value > 0 ? formatNum(liveDepth.value) : '—'));
  const displayBooks = computed(() => {
    if (!selectedBook.value) return orderBooks.value;
    return [
      selectedBook.value,
      ...orderBooks.value.filter((item) => item.tokenId !== selectedBook.value?.tokenId),
    ];
  });

  function getOrderBookSpreadLabel(book: OrderBook): string {
    const bid = Number(book.bids?.[0]?.price);
    const ask = Number(book.asks?.[0]?.price);
    if (Number.isNaN(bid) || Number.isNaN(ask)) return '—';
    return formatPriceByTick(ask - bid, book.tickSize);
  }

  function getOrderBookDepth(book: OrderBook): number {
    return [...book.bids, ...book.asks].reduce((total, level) => {
      const price = Number(level.price);
      const size = Number(level.size);
      if (!Number.isFinite(price) || !Number.isFinite(size) || price <= 0 || size <= 0) {
        return total;
      }
      return total + price * size;
    }, 0);
  }

  function handleOrderBookSpreadChange(payload: OrderBookSpreadChange): void {
    liveSpreadLabels.value = {
      ...liveSpreadLabels.value,
      [payload.tokenId]: payload.label === '-' ? '—' : payload.label,
    };
  }

  function handleOrderBookTickChange(payload: OrderBookTickChange): void {
    liveTickSizes.value = {
      ...liveTickSizes.value,
      [payload.tokenId]: payload.tickSize,
    };
  }

  return {
    orderBookDepth,
    liveSpreadLabels,
    liveTickSizes,
    displayBooks,
    spreadLabel,
    tickSizeLabel,
    liveDepthLabel,
    handleOrderBookSpreadChange,
    handleOrderBookTickChange,
  };
}
