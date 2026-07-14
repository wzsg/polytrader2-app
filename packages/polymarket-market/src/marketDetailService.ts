import { normalizeMarket, outcomesLabel, parseJsonArray } from '@polytrader/shared';
import type { PolymarketApiClient } from '@polytrader/polymarket-api';
import type {
  AppLocale,
  HolderApiGroup,
  HolderGroup,
  Market,
  MarketDetailData,
  MarketOutcome,
} from '@polytrader/shared';

class MarketDetailService {
  private readonly _apiClient: PolymarketApiClient;

  public constructor(apiClient: PolymarketApiClient) {
    this._apiClient = apiClient;
  }

  public async fetchMarketDetail(marketId: string, locale: AppLocale): Promise<MarketDetailData> {
    const raw = await this._apiClient.fetchLocalizedMarketById(marketId, locale);
    const market = normalizeMarket(raw);
    const outcomes = this.getMarketOutcomes(market, parseJsonArray(raw.outcomesJson));

    const holderGroups = await (market.conditionId
      ? this._apiClient.fetchMarketHolders(market.conditionId).catch(() => [] as unknown[])
      : Promise.resolve([] as unknown[]));

    return {
      market,
      outcomes,
      holders: this.mapHolders(outcomes, holderGroups as HolderApiGroup[]),
    };
  }

  private getMarketOutcomes(market: Market, displayOutcomes: unknown[]): MarketOutcome[] {
    return market.clobTokenIds.map((tokenId, index) => ({
      tokenId,
      label: outcomesLabel(market.outcomes[index], index),
      displayLabel: outcomesLabel(displayOutcomes[index] ?? market.outcomes[index], index),
      price: market.outcomePrices[index] ?? null,
      tickSize: market.orderPriceMinTickSize,
      minOrderSize: market.orderMinSize,
    }));
  }

  private mapHolders(outcomes: MarketOutcome[], holderGroups: HolderApiGroup[]): HolderGroup[] {
    const holdersByToken = new Map(
      (holderGroups || []).map((group) => [String(group.token), group.holders || []]),
    );

    return outcomes.map(({ tokenId, displayLabel }) => ({
      tokenId,
      label: displayLabel,
      holders: holdersByToken.get(tokenId) || [],
    }));
  }
}

export { MarketDetailService };
