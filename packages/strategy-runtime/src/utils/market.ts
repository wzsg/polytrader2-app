function getMarketTitle(market: {
  question?: string;
  groupItemTitle?: string;
  slug?: string;
  id: string;
}): string {
  return market.groupItemTitle || market.question || market.slug || market.id;
}

export { getMarketTitle };
