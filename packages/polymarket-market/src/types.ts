import type { PolymarketApiClient } from '@polytrader/polymarket-api';
import type { ApplicationEventBus } from '@polytrader/event-bus';
import type {
  EventRepository,
  MarketTradeRepositoryCreator,
  MetaRepository,
} from '@polytrader/repository-contract';
import type { EventSyncWorkflowScheduler } from './sync/index.js';

type MarketServiceCacheLoader<T> = () => Promise<T>;

interface MarketServiceCacheStore {
  getOrSetValue<T>(
    key: string,
    ttlMs: number | null,
    loader: MarketServiceCacheLoader<T>,
  ): Promise<T>;
  setValue<T>(key: string, value: T, ttlMs: number | null): Promise<void>;
}

interface MarketServiceListCacheStore extends MarketServiceCacheStore {
  clear(): void;
}

interface MarketServiceOptions {
  apiClient: PolymarketApiClient;
  eventRepository: EventRepository;
  eventSyncWorkflowScheduler: EventSyncWorkflowScheduler;
  metaRepository: MetaRepository;
  marketTradeRepositoryFactory: MarketTradeRepositoryCreator;
  cacheStore: MarketServiceCacheStore;
  listCacheStore: MarketServiceListCacheStore;
  listCacheTtlMsProvider: () => number;
  eventBus?: ApplicationEventBus;
  configBaseUrl?: string;
  configTtlMs?: number;
}

export type {
  MarketServiceCacheLoader,
  MarketServiceCacheStore,
  MarketServiceListCacheStore,
  MarketServiceOptions,
};
