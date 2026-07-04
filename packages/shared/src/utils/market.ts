import type { GammaMarketRaw, Market } from '../types/index.js';

export function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function outcomesLabel(raw: unknown, index: number): string {
  if (!raw) return `Outcome ${index + 1}`;
  const lower = String(raw).toLowerCase();
  if (lower === 'yes') return 'Yes';
  if (lower === 'no') return 'No';
  return String(raw);
}

export function normalizeMarket(raw: GammaMarketRaw): Market {
  const clobTokenIds = parseJsonArray(raw.clobTokenIds).map(String);
  const outcomes = parseJsonArray(raw.outcomes);
  const outcomePrices = parseJsonArray(raw.outcomePrices);
  const orderPriceMinTickSize =
    raw.orderPriceMinTickSize == null || raw.orderPriceMinTickSize === ''
      ? null
      : String(raw.orderPriceMinTickSize);
  const orderMinSize =
    raw.orderMinSize == null || raw.orderMinSize === '' ? null : String(raw.orderMinSize);

  return {
    id: String(raw.id),
    question: raw.question || '',
    slug: raw.slug || '',
    groupItemTitle: raw.groupItemTitle || '',
    image: raw.image || '',
    icon: raw.icon || '',
    active: raw.active === true,
    closed: raw.closed === true,
    negRisk: raw.negRisk === true,
    conditionId: raw.conditionId || '',
    clobTokenIds,
    outcomes,
    outcomePrices,
    enableOrderBook: raw.enableOrderBook !== false,
    orderPriceMinTickSize,
    orderMinSize,
    volume: Number(raw.volumeNum ?? raw.volume) || 0,
    volume24hr: Number(raw.volume24hr) || 0,
    liquidity: Number(raw.liquidityNum ?? raw.liquidity) || 0,
    endDate: raw.endDate || null,
  };
}

export function isDisplayableMarket(m: { active?: boolean; closed?: boolean }): boolean {
  return m.active === true;
}

export function countOpenMarkets(
  markets: Array<{ active?: boolean; closed?: boolean }> | undefined,
): number {
  return (markets || []).filter(isDisplayableMarket).length;
}
