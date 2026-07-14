import type { AppLocale, GammaEventRaw } from '@polytrader/shared';

const DEFAULT_TRADING_API_BASE_URL = 'https://trading-api.polytrader2.com';

class LocalizedEventApiClient {
  private readonly _baseUrl: string;

  public constructor(baseUrl = DEFAULT_TRADING_API_BASE_URL) {
    this._baseUrl = baseUrl.replace(/\/+$/, '');
  }

  public async fetchEventById(eventId: string, locale: AppLocale): Promise<GammaEventRaw> {
    const url = new URL(`${this._baseUrl}/api/events/${encodeURIComponent(eventId)}`);
    url.searchParams.set('locale', locale);
    url.searchParams.set('live', 'true');
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    return response.json() as Promise<GammaEventRaw>;
  }
}

export { LocalizedEventApiClient };
