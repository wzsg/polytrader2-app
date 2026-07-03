import type { SortOrder } from './common.js';

interface MarketTradeTick {
  id: string;
  tokenId: string;
  outcome?: string;
  side?: string;
  price?: string | number;
  priceRaw?: string | number;
  size?: string | number;
  timestamp?: string | number;
  transactionHash?: string;
  source: 'history' | 'live';
}

type MarketTradeSortField = 'outcome' | 'price' | 'side' | 'size' | 'time';
type MarketTradeSyncState = 'idle' | 'syncing' | 'ready' | 'error';

interface MarketTradeQuery {
  marketId?: string;
  conditionId: string;
  outcome?: string;
  side?: string;
  priceMin?: string | number;
  priceMax?: string | number;
  sizeMin?: string | number;
  sizeMax?: string | number;
  timeFrom?: string | number;
  timeTo?: string | number;
  sortField?: MarketTradeSortField;
  sortOrder?: SortOrder;
  limit?: number;
  offset?: number;
}

interface MarketTradeSyncStatus {
  marketId?: string;
  conditionId: string;
  state: MarketTradeSyncState;
  totalCached: number;
  backfilled: boolean;
  lastSyncedAt: string | null;
  error?: string;
}

interface MarketTradeListResult {
  items: MarketTradeTick[];
  total: number;
  hasMore: boolean;
  syncStatus: MarketTradeSyncStatus;
  lastSyncedAt: string | null;
  error?: string;
}

type MarketTradeAnalysisBucket = '1m' | '5m' | '15m' | '1h';

interface MarketTradeAnalysisQuery {
  marketId?: string;
  conditionId: string;
  outcome?: string;
  side?: string;
  timeFrom?: string | number;
  timeTo?: string | number;
  bucket?: MarketTradeAnalysisBucket;
}

interface MarketTradeAnalysisSummary {
  totalTrades: number;
  totalSize: number;
  notional: number;
  vwap: number | null;
  latestPrice: number | null;
  highPrice: number | null;
  lowPrice: number | null;
  buySize: number;
  sellSize: number;
  imbalance: number;
  imbalanceRatio: number | null;
}

interface MarketTradeAnalysisBreakdown {
  key: string;
  trades: number;
  size: number;
  notional: number;
  vwap: number | null;
  buySize: number;
  sellSize: number;
  imbalance: number;
  imbalanceRatio: number | null;
}

interface MarketTradeAnalysisPoint {
  bucketStart: number;
  outcome: string;
  trades: number;
  size: number;
  notional: number;
  vwap: number | null;
  closePrice: number | null;
  buySize: number;
  sellSize: number;
  imbalance: number;
  imbalanceRatio: number | null;
}

interface MarketTradeAnalysisResult {
  summary: MarketTradeAnalysisSummary;
  outcomeBreakdown: MarketTradeAnalysisBreakdown[];
  sideBreakdown: MarketTradeAnalysisBreakdown[];
  timeSeries: MarketTradeAnalysisPoint[];
  largeTrades: MarketTradeTick[];
  syncStatus: MarketTradeSyncStatus;
  lastSyncedAt: string | null;
  error?: string;
}

export type {
  MarketTradeAnalysisBucket,
  MarketTradeAnalysisBreakdown,
  MarketTradeAnalysisPoint,
  MarketTradeAnalysisQuery,
  MarketTradeAnalysisResult,
  MarketTradeAnalysisSummary,
  MarketTradeListResult,
  MarketTradeQuery,
  MarketTradeSortField,
  MarketTradeSyncState,
  MarketTradeSyncStatus,
  MarketTradeTick,
};
