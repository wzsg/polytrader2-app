import type { StrategyReferenceNode, StrategyValueType } from '../types.js';

interface StrategyReferenceMetadata {
  type: StrategyValueType;
  nullable: boolean;
  requirement: 'orderBook' | 'account' | 'positions' | 'market' | 'trades' | null;
  requiresSelectedOutcome: boolean;
}

class StrategyReferenceCatalog {
  private readonly _entries = new Map<string, StrategyReferenceMetadata>([
    ['orderBook.bestBid', this._metadata('decimal', true, 'orderBook', true)],
    ['orderBook.bestAsk', this._metadata('decimal', true, 'orderBook', true)],
    ['orderBook.midpoint', this._metadata('decimal', true, 'orderBook', true)],
    ['orderBook.spread', this._metadata('decimal', true, 'orderBook', true)],
    ['orderBook.tickSize', this._metadata('decimal', false, 'orderBook', true)],
    ['account.availableBalance', this._metadata('decimal', false, 'account', false)],
    ['account.openOrderCount', this._metadata('integer', false, 'account', false)],
    ['position.size', this._metadata('decimal', true, 'positions', true)],
    ['position.averagePrice', this._metadata('decimal', true, 'positions', true)],
    ['position.currentValue', this._metadata('decimal', true, 'positions', true)],
    ['position.cashPnl', this._metadata('decimal', true, 'positions', true)],
    ['market.active', this._metadata('boolean', false, 'market', false)],
    ['market.closed', this._metadata('boolean', false, 'market', false)],
    ['market.volume', this._metadata('decimal', false, 'market', false)],
    ['market.volume24hr', this._metadata('decimal', false, 'market', false)],
    ['market.liquidity', this._metadata('decimal', false, 'market', false)],
    ['trade.price', this._metadata('decimal', true, 'trades', true)],
    ['trade.size', this._metadata('decimal', true, 'trades', true)],
    ['trade.side', this._metadata('orderSide', true, 'trades', true)],
    ['event.sequence', this._metadata('integer', false, null, false)],
    ['event.occurredAt', this._metadata('timestamp', false, null, false)],
  ]);

  public get(node: StrategyReferenceNode): StrategyReferenceMetadata | null {
    const metadata = this._entries.get(`${node.source}.${node.field}`) ?? null;
    if (!metadata) return null;
    if (metadata.requiresSelectedOutcome && !('outcome' in node && node.outcome === 'selected')) {
      return null;
    }
    if (!metadata.requiresSelectedOutcome && 'outcome' in node && node.outcome != null) {
      return null;
    }
    return metadata;
  }

  private _metadata(
    type: StrategyValueType,
    nullable: boolean,
    requirement: StrategyReferenceMetadata['requirement'],
    requiresSelectedOutcome: boolean,
  ): StrategyReferenceMetadata {
    return { type, nullable, requirement, requiresSelectedOutcome };
  }
}

export { StrategyReferenceCatalog };
export type { StrategyReferenceMetadata };
