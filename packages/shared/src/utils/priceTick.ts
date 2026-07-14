const SUPPORTED_PRICE_TICK_SIZES = ['0.1', '0.01', '0.005', '0.0025', '0.001', '0.0001'] as const;

type SupportedPriceTickSize = (typeof SUPPORTED_PRICE_TICK_SIZES)[number];

const SUPPORTED_PRICE_TICK_SIZE_SET = new Set<string>(SUPPORTED_PRICE_TICK_SIZES);

function normalizePriceTickSize(value: unknown): SupportedPriceTickSize | null {
  if (value == null || value === '') return null;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return null;
  const normalized = numericValue.toString();
  return SUPPORTED_PRICE_TICK_SIZE_SET.has(normalized)
    ? (normalized as SupportedPriceTickSize)
    : null;
}

function priceCentsStepForTick(value: unknown): number | null {
  const tickSize = normalizePriceTickSize(value);
  return tickSize == null ? null : Number(tickSize) * 100;
}

function priceCentsDigitsForTick(value: unknown): number | null {
  const step = priceCentsStepForTick(value);
  if (step == null) return null;
  for (let digits = 0; digits <= 8; digits += 1) {
    const scale = 10 ** digits;
    if (Math.abs(step * scale - Math.round(step * scale)) < 1e-9) return digits;
  }
  return 8;
}

function isPriceAlignedToTick(price: unknown, tickSize: unknown): boolean {
  const normalizedTickSize = normalizePriceTickSize(tickSize);
  const numericPrice = Number(price);
  if (normalizedTickSize == null || !Number.isFinite(numericPrice)) return false;
  const stepCount = numericPrice / Number(normalizedTickSize);
  return Math.abs(stepCount - Math.round(stepCount)) < 1e-9;
}

export {
  SUPPORTED_PRICE_TICK_SIZES,
  isPriceAlignedToTick,
  normalizePriceTickSize,
  priceCentsDigitsForTick,
  priceCentsStepForTick,
};
export type { SupportedPriceTickSize };
