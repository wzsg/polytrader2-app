import { normalizeMarket, outcomesLabel } from '@polytrader/shared';
import type { PolymarketApiClient } from '@polytrader/polymarket-api';
import type {
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

  public async fetchMarketDetail(marketId: string): Promise<MarketDetailData> {
    const raw = await this._apiClient.fetchMarketById(marketId);
    const market = normalizeMarket(raw);
    const outcomes = this.getMarketOutcomes(market);

    const holderGroups = await (market.conditionId
      ? this._apiClient.fetchMarketHolders(market.conditionId).catch(() => [] as unknown[])
      : Promise.resolve([] as unknown[]));

    return {
      market,
      outcomes,
      holders: this.mapHolders(outcomes, holderGroups as HolderApiGroup[]),
    };
  }

  private getMarketOutcomes(market: Market): MarketOutcome[] {
    return market.clobTokenIds.map((tokenId, index) => ({
      tokenId,
      label: outcomesLabel(market.outcomes[index], index),
      price: market.outcomePrices[index] ?? null,
      tickSize: market.orderPriceMinTickSize,
      minOrderSize: market.orderMinSize,
    }));
  }

  private mapHolders(outcomes: MarketOutcome[], holderGroups: HolderApiGroup[]): HolderGroup[] {
    const holdersByToken = new Map(
      (holderGroups || []).map((group) => [String(group.token), group.holders || []]),
    );

    return outcomes.map(({ tokenId, label }) => ({
      tokenId,
      label,
      holders: holdersByToken.get(tokenId) || [],
    }));
  }
}

export { MarketDetailService };
