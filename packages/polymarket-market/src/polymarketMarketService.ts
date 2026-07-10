import { EventEmitter } from 'events';
import type {
  CryptoCategoryConfig,
  CryptoEventsResult,
  EventCategoryConfig,
  AppLocale,
  ListCryptoEventsParams,
  ListSportsEventsParams,
  MarketDetailData,
  MarketTradeSyncStatus,
  SportsCategoryConfig,
  SportsEventsResult,
  SportsMetadataItem,
  SyncScheduleConfig,
  SyncStatus,
  EventSyncTrigger,
} from '@polytrader/shared';
import { DEFAULT_LOCALE } from '@polytrader/shared';
import type { ApplicationEventBus } from '@polytrader/event-bus';
import { CryptoEventsService } from './crypto/cryptoEventsService.js';
import { MarketCategoryConfigClient } from './marketCategoryConfigClient.js';
import { MarketDetailService } from './marketDetailService.js';
import { SportsEventsService } from './sports/sportsEventsService.js';
import { EventSyncScheduler, EventSyncService, MarketTradeSyncService } from './sync/index.js';
import type { EventSyncResult, EventSyncWorkflowInput } from './sync/index.js';
import type { MarketServiceOptions } from './types.js';

type PolymarketMarketServiceEventMap = {
  'event-sync-status': [status: SyncStatus];
  'market-trade-sync-status': [status: MarketTradeSyncStatus];
};

class PolymarketMarketService extends EventEmitter<PolymarketMarketServiceEventMap> {
  private readonly _detailService: MarketDetailService;
  private readonly _cryptoEventsService: CryptoEventsService;
  private readonly _sportsEventsService: SportsEventsService;
  private readonly _categoryConfigClient: MarketCategoryConfigClient;
  private readonly _eventSyncService: EventSyncService;
  private readonly _eventSyncScheduler: EventSyncScheduler;
  private readonly _marketTradeSyncService: MarketTradeSyncService;
  private readonly _eventBus: ApplicationEventBus | null;
  private _categoryConfigLocale: AppLocale;

  public constructor(options: MarketServiceOptions) {
    super();
    this._eventBus = options.eventBus ?? null;
    this._categoryConfigLocale = DEFAULT_LOCALE;
    this._detailService = new MarketDetailService(options.apiClient);
    this._cryptoEventsService = new CryptoEventsService(options.eventRepository);
    this._sportsEventsService = new SportsEventsService({
      apiClient: options.apiClient,
      repository: options.eventRepository,
      cacheStore: options.cacheStore,
    });
    this._categoryConfigClient = new MarketCategoryConfigClient(options.cacheStore, {
      configBaseUrl: options.configBaseUrl,
      configTtlMs: options.configTtlMs,
    });
    this._eventSyncService = new EventSyncService({
      eventRepository: options.eventRepository,
      metaRepository: options.metaRepository,
      client: {
        streamOpenEvents: options.apiClient.streamOpenEvents.bind(options.apiClient),
      },
    });
    this._eventSyncScheduler = new EventSyncScheduler(
      options.eventSyncWorkflowScheduler,
      options.metaRepository,
    );
    this._marketTradeSyncService = new MarketTradeSyncService({
      repositoryFactory: options.marketTradeRepositoryFactory,
      client: {
        streamMarketTrades: options.apiClient.streamMarketTrades.bind(options.apiClient),
      },
    });
    this._eventSyncService.on('status', this.handleEventSyncStatus.bind(this));
    this._marketTradeSyncService.on('status', this.handleMarketTradeSyncStatus.bind(this));
  }

  public fetchMarketDetail(marketId: string): Promise<MarketDetailData> {
    return this._detailService.fetchMarketDetail(marketId);
  }

  public listCryptoEvents(params: ListCryptoEventsParams): Promise<CryptoEventsResult> {
    return this._cryptoEventsService.listCryptoEvents(params);
  }

  public listSportsEvents(params: ListSportsEventsParams): Promise<SportsEventsResult> {
    return this._sportsEventsService.listSportsEvents(params);
  }

  public fetchCryptoCategory(): Promise<CryptoCategoryConfig> {
    return this._categoryConfigClient.fetchCryptoCategory(this._categoryConfigLocale);
  }

  public fetchEventCategory(): Promise<EventCategoryConfig> {
    return this._categoryConfigClient.fetchEventCategory(this._categoryConfigLocale);
  }

  public fetchSportsCategory(): Promise<SportsCategoryConfig> {
    return this._categoryConfigClient.fetchSportsCategory(this._categoryConfigLocale);
  }

  public fetchSportsMetadata(): Promise<SportsMetadataItem[]> {
    return this._sportsEventsService.fetchSportsMetadata();
  }

  public startEventSync(): Promise<void> {
    return this._eventSyncScheduler.enqueue('manual', { replacePending: true });
  }

  public enqueueEventSync(
    trigger: EventSyncTrigger,
    options?: { replacePending?: boolean },
  ): Promise<void> {
    return this._eventSyncScheduler.enqueue(trigger, options);
  }

  public setEventSyncLocale(locale: AppLocale): void {
    this._eventSyncScheduler.setLocale(locale);
  }

  public setCategoryConfigLocale(locale: AppLocale): boolean {
    if (this._categoryConfigLocale === locale) return false;
    this._categoryConfigLocale = locale;
    return true;
  }

  public readSyncScheduleConfig(): Promise<SyncScheduleConfig> {
    return this._eventSyncScheduler.readConfig();
  }

  public writeSyncScheduleConfig(config: Partial<SyncScheduleConfig>): Promise<SyncScheduleConfig> {
    return this._eventSyncScheduler.writeConfig(config);
  }

  public applySyncScheduleConfig(
    config?: SyncScheduleConfig,
    initialTrigger: EventSyncTrigger | null = 'startup',
  ): Promise<void> {
    return this._eventSyncScheduler.apply(config, initialTrigger);
  }

  public runEventSyncWorkflow(
    input: EventSyncWorkflowInput,
    signal: AbortSignal,
  ): Promise<EventSyncResult> {
    return this._eventSyncService.run(input, signal);
  }

  public startMarketTradeSync(marketId: string, conditionId: string): MarketTradeSyncStatus {
    return this._marketTradeSyncService.start(marketId, conditionId);
  }

  public getMarketTradeSyncStatus(
    marketId: string,
    conditionId: string,
  ): Promise<MarketTradeSyncStatus> {
    return this._marketTradeSyncService.status(marketId, conditionId);
  }

  public stopAllMarketTradeSync(): void {
    this._marketTradeSyncService.stopAll();
  }

  private handleEventSyncStatus(status: SyncStatus): void {
    this._eventBus?.publish('polymarket-event-sync:status', {
      status,
      at: new Date().toISOString(),
    });
    this.emit('event-sync-status', status);
  }

  private handleMarketTradeSyncStatus(status: MarketTradeSyncStatus): void {
    this.emit('market-trade-sync-status', status);
  }
}

export { PolymarketMarketService };
export type { PolymarketMarketServiceEventMap };
