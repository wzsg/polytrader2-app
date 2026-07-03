import type { ApiEvent, DbMarket, EventListItem, Market } from '@polytrader/shared';
import { isDisplayableMarket, parseJsonArray } from '@polytrader/shared';
import { translateUiKey } from '../i18n';
import { formatOutcomeLabel, formatOutcomePrice } from './format.js';

function getFirstOutcomePrice(market: DbMarket | Market): number | null {
  try {
    const prices = parseJsonArray(market.outcomePrices);
    if (!prices.length) return null;
    const price = Number(prices[0]);
    return isNaN(price) ? null : price;
  } catch {
    return null;
  }
}

function firstOutcomeDistanceFromHalf(market: DbMarket | Market): number {
  const price = getFirstOutcomePrice(market);
  if (price == null) return Infinity;
  return Math.abs(price - 0.5);
}

function sortMarketsByFirstOutcomeDistance(
  markets: Array<DbMarket | Market> | undefined,
): Array<DbMarket | Market> {
  return [...(markets || [])].sort(
    (a, b) => firstOutcomeDistanceFromHalf(a) - firstOutcomeDistanceFromHalf(b),
  );
}

function displayMarkets(markets: Array<DbMarket | Market> | undefined): Array<DbMarket | Market> {
  return sortMarketsByFirstOutcomeDistance((markets || []).filter(isDisplayableMarket));
}

function openMarkets(markets: Array<DbMarket | Market> | undefined): Array<DbMarket | Market> {
  return displayMarkets(markets);
}

function getSingleOpenMarket(
  event: EventListItem | ApiEvent | null | undefined,
): (DbMarket | Market) | null {
  const open = openMarkets(event?.markets as Array<DbMarket | Market>);
  return open.length === 1 ? open[0] : null;
}

function getMarketSpreadCents(market: DbMarket | Market): number | null {
  try {
    const prices = parseJsonArray(market.outcomePrices);
    if (prices.length < 2) return null;
    const p0 = Number(prices[0]);
    const p1 = Number(prices[1]);
    if (isNaN(p0) || isNaN(p1)) return null;
    return Math.abs(p0 - p1) * 100;
  } catch {
    return null;
  }
}

function formatSpreadCents(cents: number | null): string {
  if (cents == null) return '-';
  return `${cents.toFixed(1)}¢`;
}

function getMarketIcon(
  market: { icon?: string; image?: string },
  event: { icon?: string; image?: string },
): string {
  return market.icon || market.image || event.icon || event.image || '';
}

function getMarketTitle(market: { groupItemTitle?: string; question?: string }): string {
  return market.groupItemTitle || market.question || '';
}

function getOutcomeButtons(
  market: DbMarket | Market,
): Array<{ label: string; price: string; variant: string }> {
  try {
    const prices = parseJsonArray(market.outcomePrices);
    const outcomes = parseJsonArray(market.outcomes);
    return prices.map((p, i) => {
      const raw = outcomes[i];
      const label = formatOutcomeLabel(raw, i);
      const price = formatOutcomePrice(p);
      const rawLower = String(raw || '').toLowerCase();
      const variant = rawLower === 'yes' ? 'yes' : rawLower === 'no' ? 'no' : 'default';
      return { label, price, variant };
    });
  } catch {
    return [];
  }
}

function getStatusInfo(event: { closed?: boolean; active?: boolean }): {
  label: string;
  class: string;
} {
  if (event.closed) {
    return { label: translateUiKey('status.closed'), class: 'bg-danger/20 text-[#f08090]' };
  }
  if (event.active) {
    return { label: translateUiKey('status.active'), class: 'bg-primary/20 text-[#6b8cff]' };
  }
  return { label: translateUiKey('status.inactive'), class: 'bg-muted/20 text-muted' };
}

export {
  displayMarkets,
  formatSpreadCents,
  getFirstOutcomePrice,
  getMarketIcon,
  getMarketSpreadCents,
  getMarketTitle,
  getOutcomeButtons,
  getSingleOpenMarket,
  getStatusInfo,
  isDisplayableMarket,
  openMarkets,
};
