import {
  POLYTRADER_CONFIG_BASE_URL,
  type CryptoCategoryConfig,
  type EventCategoryConfig,
} from '@polytrader/shared';
import type { MarketServiceCacheStore } from './types.js';

const DEFAULT_CONFIG_TTL_MS = 60 * 60 * 1000;
const CRYPTO_CATEGORY_PATH = 'crypto-category.json';
const CRYPTO_CATEGORY_STORE_KEY = 'crypto-category';
const EVENT_CATEGORY_URL = 'https://trading-api.polytrader2.com/api/event-category';
const EVENT_CATEGORY_STORE_KEY = 'event-category';

interface MarketCategoryConfigClientOptions {
  configBaseUrl?: string;
  configTtlMs?: number;
}

interface ConfigDefinition {
  path: string;
  storeKey: string;
}

class MarketCategoryConfigClient {
  private readonly _cacheStore: MarketServiceCacheStore;
  private readonly _configBaseUrl: string;
  private readonly _configTtlMs: number;

  public constructor(
    cacheStore: MarketServiceCacheStore,
    options: MarketCategoryConfigClientOptions = {},
  ) {
    this._cacheStore = cacheStore;
    this._configBaseUrl = this.normalizeBaseUrl(
      options.configBaseUrl || POLYTRADER_CONFIG_BASE_URL,
    );
    this._configTtlMs = options.configTtlMs ?? DEFAULT_CONFIG_TTL_MS;
  }

  public fetchCryptoCategory(): Promise<CryptoCategoryConfig> {
    return this.fetchCachedConfig<CryptoCategoryConfig>({
      path: CRYPTO_CATEGORY_PATH,
      storeKey: CRYPTO_CATEGORY_STORE_KEY,
    });
  }

  public fetchEventCategory(): Promise<EventCategoryConfig> {
    return this._cacheStore.getOrSetValue<EventCategoryConfig>(
      EVENT_CATEGORY_STORE_KEY,
      this._configTtlMs,
      async () => this.normalizeEventCategoryConfig(await this.fetchRemoteConfig(EVENT_CATEGORY_URL)),
    );
  }

  private fetchCachedConfig<T>(definition: ConfigDefinition): Promise<T> {
    return this._cacheStore.getOrSetValue<T>(definition.storeKey, this._configTtlMs, () =>
      this.fetchRemoteConfig<T>(this.buildConfigUrl(definition.path)),
    );
  }

  private async fetchRemoteConfig<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }

    return (await res.json()) as T;
  }

  private buildConfigUrl(path: string): string {
    return `${this._configBaseUrl}/${path}`;
  }

  private normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.replace(/\/+$/, '');
  }

  private normalizeEventCategoryConfig(config: EventCategoryConfig): EventCategoryConfig {
    return {
      ...config,
      categories: config.categories.map((category) => ({
        ...category,
        tagIds: this.normalizeEventCategoryIds(category.tagIds),
        excludeTagIds: this.normalizeEventCategoryIds(category.excludeTagIds),
      })),
    };
  }

  private normalizeEventCategoryIds(ids: Array<string | number> | undefined): number[] | undefined {
    if (!Array.isArray(ids)) return undefined;

    return ids
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id));
  }
}

export { MarketCategoryConfigClient };
export type { MarketCategoryConfigClientOptions };
