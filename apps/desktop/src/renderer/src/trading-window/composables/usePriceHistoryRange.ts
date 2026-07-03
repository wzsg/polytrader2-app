type PriceHistoryRange = '1h' | '6h' | '1d' | '1w' | '1m' | 'all';

interface PriceHistoryRangeOption {
  label: string;
  value: PriceHistoryRange;
  fidelity: number;
}

const PRICE_HISTORY_RANGE_OPTIONS: PriceHistoryRangeOption[] = [
  { label: '1H', value: '1h', fidelity: 1 },
  { label: '6H', value: '6h', fidelity: 5 },
  { label: '1D', value: '1d', fidelity: 15 },
  { label: '1W', value: '1w', fidelity: 60 },
  { label: '1M', value: '1m', fidelity: 240 },
  { label: 'ALL', value: 'all', fidelity: 60 },
];

function resolvePriceHistoryRange(value: PriceHistoryRange): PriceHistoryRangeOption {
  return (
    PRICE_HISTORY_RANGE_OPTIONS.find((option) => option.value === value) ??
    PRICE_HISTORY_RANGE_OPTIONS[0]
  );
}

export { PRICE_HISTORY_RANGE_OPTIONS, resolvePriceHistoryRange };
export type { PriceHistoryRange, PriceHistoryRangeOption };
