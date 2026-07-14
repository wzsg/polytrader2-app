import type { AppLocale, GammaEventRaw, GammaMarketRaw } from '@polytrader/shared';

const DEFAULT_TRADING_API_BASE_URL = 'https://trading-api.polytrader2.com';

interface LocalizedGammaMarketRaw extends GammaMarketRaw {
  outcomesJson: string[];
}

class TradingApiClient {
  private readonly _baseUrl: string;

  public constructor(baseUrl = DEFAULT_TRADING_API_BASE_URL) {
    this._baseUrl = baseUrl.replace(/\/+$/, '');
  }

  public fetchEventById(eventId: string, locale: AppLocale): Promise<GammaEventRaw> {
    return this._fetchLocalized(`/api/events/${encodeURIComponent(eventId)}`, locale);
  }

  public fetchMarketById(marketId: string, locale: AppLocale): Promise<LocalizedGammaMarketRaw> {
    return this._fetchLocalized(`/api/markets/${encodeURIComponent(marketId)}`, locale);
  }

  private async _fetchLocalized<T>(path: string, locale: AppLocale): Promise<T> {
    const url = new URL(`${this._baseUrl}${path}`);
    url.searchParams.set('locale', locale);
    url.searchParams.set('live', 'true');
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    return response.json() as Promise<T>;
  }
}

export { TradingApiClient };
export type { LocalizedGammaMarketRaw };
