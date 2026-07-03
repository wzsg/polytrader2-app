import type { ApiEvent, DbMarket, GammaEventRaw, GammaMarketRaw, Market } from '@polytrader/shared';
import { normalizeMarket, parseJsonArray } from '@polytrader/shared';
import { formatOutcomeLabel } from './format.js';
import { parseEventTeams } from './teams.js';

export function normalizeApiMarket(market: GammaMarketRaw): Market {
  return normalizeMarket(market);
}

export function getMarketOutcomes(
  market: Market | DbMarket | GammaMarketRaw,
): Array<{ tokenId: string; label: string; price: unknown }> {
  const tokenIds = parseJsonArray('clobTokenIds' in market ? market.clobTokenIds : undefined).map(
    String,
  );
  const outcomes = parseJsonArray(market.outcomes);
  const prices = parseJsonArray(market.outcomePrices);

  if (tokenIds.length) {
    return tokenIds.map((tokenId, index) => ({
      tokenId,
      label: formatOutcomeLabel(outcomes[index], index),
      price: prices[index] ?? null,
    }));
  }

  return outcomes.map((raw, index) => ({
    tokenId: '',
    label: formatOutcomeLabel(raw, index),
    price: prices[index] ?? null,
  }));
}

export function normalizeApiEvent(event: GammaEventRaw): ApiEvent {
  return {
    id: String(event.id),
    title: event.title || '',
    slug: event.slug || '',
    image: event.image || event.icon || '',
    icon: event.icon || event.image || '',
    volume: Number(event.volume) || 0,
    volume24hr: Number(event.volume24hr) || 0,
    liquidity: Number(event.liquidity) || 0,
    active: event.active === true,
    closed: event.closed === true,
    start_date: event.startDate || null,
    end_date: event.endDate || null,
    featured: event.featured === true,
    parentEventId: event.parentEventId == null ? null : String(event.parentEventId),
    teams: parseEventTeams(event.teams),
    description: event.description || '',
    markets: (event.markets || []).map(normalizeApiMarket),
  };
}

export function getMarketTitle(market: { groupItemTitle?: string; question?: string }): string {
  return market.groupItemTitle || market.question || '';
}

export { parseJsonArray };
