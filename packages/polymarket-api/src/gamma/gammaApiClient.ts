import {
  POLYTRADER_GAMMA_PROXY_BASE_URL,
  type GammaEventRaw,
  type GammaMarketRaw,
  type MarketTradeTick,
  type PriceHistoryPoint,
  type SportsMetadataRaw,
} from '@polytrader/shared';
import type {
  GammaEventKeysetResponse,
  GammaSseMessage,
  GammaStreamPage,
  GammaStreamPagePayload,
  MarketTradeBackfillDonePayload,
  MarketTradeDonePayload,
  MarketTradeHeartbeatPayload,
  MarketTradeStreamEvent,
  MarketTradeStreamOptions,
  MarketTradeStreamPagePayload,
  PriceHistoryStreamPage,
  PriceHistoryStreamPagePayload,
} from './types.js';

class PolymarketGammaApiClient {
  private readonly _proxyBaseUrl: string;

  public constructor(proxyBaseUrl = POLYTRADER_GAMMA_PROXY_BASE_URL) {
    this._proxyBaseUrl = proxyBaseUrl.replace(/\/+$/, '');
  }

  public async fetchEventById(eventId: string): Promise<GammaEventRaw> {
    const res = await fetch(`${this._proxyBaseUrl}/events/${encodeURIComponent(eventId)}`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }
    return res.json() as Promise<GammaEventRaw>;
  }

  public async fetchMarketById(marketId: string): Promise<GammaMarketRaw> {
    const res = await fetch(`${this._proxyBaseUrl}/markets/${encodeURIComponent(marketId)}`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }
    return res.json() as Promise<GammaMarketRaw>;
  }

  public async fetchSportsMetadata(): Promise<SportsMetadataRaw[]> {
    const res = await fetch(`${this._proxyBaseUrl}/sports`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) {
      throw new Error('Unexpected Gamma sports metadata response');
    }
    return data as SportsMetadataRaw[];
  }

  private async fetchEventsByUrl(url: string, signal?: AbortSignal): Promise<GammaEventRaw[]> {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) {
      throw new Error('Unexpected Gamma events response');
    }
    return data as GammaEventRaw[];
  }

  public fetchEventsBySearchParams(
    searchParams: URLSearchParams,
    signal?: AbortSignal,
  ): Promise<GammaEventRaw[]> {
    return this.fetchEventsByUrl(`${this._proxyBaseUrl}/events?${searchParams}`, signal);
  }

  public async fetchEventsKeyset(
    searchParams: URLSearchParams,
    signal: AbortSignal,
  ): Promise<{ events: GammaEventRaw[]; nextCursor?: string }> {
    const res = await fetch(`${this._proxyBaseUrl}/events/keyset?${searchParams}`, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

    const data = (await res.json()) as GammaEventKeysetResponse;
    return { events: data.events || [], nextCursor: data.next_cursor };
  }

  public async *streamOpenEvents(signal: AbortSignal): AsyncGenerator<GammaStreamPage> {
    for await (const message of this.streamSse(
      `${this._proxyBaseUrl}/events/stream/open`,
      {},
      signal,
    )) {
      if (message.event === 'done') return;
      if (message.event !== 'page') continue;
      yield this.parseStreamPage(message.data);
    }
  }

  public async *streamEventsByIds(
    ids: string[],
    signal: AbortSignal,
  ): AsyncGenerator<GammaStreamPage> {
    for await (const message of this.streamSse(
      `${this._proxyBaseUrl}/events/stream/by-ids`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids }),
      },
      signal,
    )) {
      if (message.event === 'done') return;
      if (message.event !== 'page') continue;
      yield this.parseStreamPage(message.data);
    }
  }

  public async *streamPriceHistory(
    tokenIds: string[],
    interval = '1d',
    fidelity = 5,
    signal?: AbortSignal,
  ): AsyncGenerator<PriceHistoryStreamPage> {
    const normalizedTokenIds = this.normalizeTokenIds(tokenIds);
    if (!normalizedTokenIds.length) return;

    for await (const message of this.streamSse(
      `${this._proxyBaseUrl}/price-history/stream`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tokenIds: normalizedTokenIds, interval, fidelity }),
      },
      signal ?? new AbortController().signal,
    )) {
      if (message.event === 'done') return;
      if (message.event !== 'page') continue;
      yield this.parsePriceHistoryStreamPage(message.data);
    }
  }

  public async *streamMarketTrades(
    conditionId: string,
    options: MarketTradeStreamOptions = {},
    signal?: AbortSignal,
  ): AsyncGenerator<MarketTradeStreamEvent> {
    const normalizedConditionId = String(conditionId || '').trim();
    if (!normalizedConditionId) return;

    for await (const message of this.streamSse(
      `${this._proxyBaseUrl}/market-trades/stream`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conditionId: normalizedConditionId,
          backfill: options.backfill !== false,
          follow: options.follow !== false,
        }),
      },
      signal ?? new AbortController().signal,
    )) {
      if (message.event === 'page') {
        yield this.parseMarketTradeStreamPage(message.data);
      } else if (message.event === 'backfill-done') {
        yield this.parseMarketTradeBackfillDone(message.data);
      } else if (message.event === 'heartbeat') {
        yield this.parseMarketTradeHeartbeat(message.data);
      } else if (message.event === 'done') {
        yield this.parseMarketTradeDone(message.data);
        return;
      }
    }
  }

  private async *streamSse(
    url: string,
    init: RequestInit,
    signal: AbortSignal,
  ): AsyncGenerator<GammaSseMessage> {
    const res = await fetch(url, {
      ...init,
      signal,
      headers: {
        Accept: 'text/event-stream',
        ...init.headers,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    if (!res.body) throw new Error('SSE response did not include a body');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const result = await reader.read();
        buffer += decoder.decode(result.value, { stream: !result.done });
        buffer = yield* this.consumeSseBuffer(buffer);
        if (result.done) break;
      }
      yield* this.consumeSseBuffer(`${buffer}\n\n`);
    } finally {
      reader.releaseLock();
    }
  }

  private *consumeSseBuffer(buffer: string): Generator<GammaSseMessage, string> {
    let remaining = buffer;
    while (true) {
      const delimiter = this.findSseDelimiter(remaining);
      if (!delimiter) return remaining;

      const chunk = remaining.slice(0, delimiter.index);
      remaining = remaining.slice(delimiter.index + delimiter.length);
      if (!chunk.trim()) continue;

      const message = this.parseSseMessage(chunk);
      if (message.event === 'error') {
        throw new Error(this.errorMessageFromSseData(message.data));
      }
      yield message;
    }
  }

  private findSseDelimiter(buffer: string): { index: number; length: number } | null {
    const crlfIndex = buffer.indexOf('\r\n\r\n');
    const lfIndex = buffer.indexOf('\n\n');
    if (crlfIndex === -1 && lfIndex === -1) return null;
    if (crlfIndex !== -1 && (lfIndex === -1 || crlfIndex < lfIndex)) {
      return { index: crlfIndex, length: 4 };
    }
    return { index: lfIndex, length: 2 };
  }

  private parseSseMessage(chunk: string): GammaSseMessage {
    let event = 'message';
    const dataLines: string[] = [];

    for (const rawLine of chunk.split(/\r?\n/)) {
      if (rawLine.startsWith('event:')) {
        event = rawLine.slice('event:'.length).trim();
      } else if (rawLine.startsWith('data:')) {
        dataLines.push(rawLine.slice('data:'.length).trimStart());
      }
    }

    const rawData = dataLines.join('\n');
    const data = rawData ? (JSON.parse(rawData) as unknown) : null;
    return { event, data };
  }

  private parseStreamPage(data: unknown): GammaStreamPage {
    if (typeof data !== 'object' || data === null) {
      throw new Error('Unexpected Gamma stream page response');
    }
    const page = data as GammaStreamPagePayload;
    if (!Array.isArray(page.events)) {
      throw new Error('Unexpected Gamma stream events response');
    }
    return { events: page.events, nextCursor: page.nextCursor, ids: page.ids };
  }

  private parsePriceHistoryStreamPage(data: unknown): PriceHistoryStreamPage {
    if (typeof data !== 'object' || data === null) {
      throw new Error('Unexpected price history stream page response');
    }
    const page = data as PriceHistoryStreamPagePayload;
    const tokenId = String(page.tokenId || '').trim();
    if (!tokenId) throw new Error('Unexpected price history stream token response');
    if (!Array.isArray(page.points)) {
      throw new Error('Unexpected price history stream points response');
    }
    return {
      tokenId,
      interval: String(page.interval || '1d'),
      fidelity: Math.max(1, Math.trunc(Number(page.fidelity) || 5)),
      pointOffset: Math.max(0, Math.trunc(Number(page.pointOffset) || 0)),
      complete: page.complete === true,
      points: this.normalizePriceHistoryPoints(page.points),
    };
  }

  private normalizePriceHistoryPoints(points: unknown[]): PriceHistoryPoint[] {
    return points
      .map((point) => {
        const item = point as { t?: unknown; p?: unknown };
        return {
          t: Number(item.t),
          p: Number(item.p),
        };
      })
      .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.p))
      .sort((a, b) => a.t - b.t);
  }

  private parseMarketTradeStreamPage(data: unknown): MarketTradeStreamEvent {
    if (typeof data !== 'object' || data === null) {
      throw new Error('Unexpected market trade stream page response');
    }
    const page = data as MarketTradeStreamPagePayload;
    const conditionId = String(page.conditionId || '').trim();
    if (!conditionId) throw new Error('Unexpected market trade stream condition response');
    if (!Array.isArray(page.trades)) {
      throw new Error('Unexpected market trade stream trades response');
    }
    return {
      type: 'page',
      phase: page.phase === 'recent' ? 'recent' : 'backfill',
      conditionId,
      page: Math.max(0, Math.trunc(Number(page.page) || 0)),
      offset: Math.max(0, Math.trunc(Number(page.offset) || 0)),
      total: Math.max(0, Math.trunc(Number(page.total) || 0)),
      trades: this.normalizeMarketTrades(page.trades),
    };
  }

  private parseMarketTradeBackfillDone(data: unknown): MarketTradeStreamEvent {
    if (typeof data !== 'object' || data === null) {
      throw new Error('Unexpected market trade backfill response');
    }
    const payload = data as MarketTradeBackfillDonePayload;
    const conditionId = String(payload.conditionId || '').trim();
    if (!conditionId) throw new Error('Unexpected market trade backfill condition response');
    return {
      type: 'backfill-done',
      conditionId,
      pages: Math.max(0, Math.trunc(Number(payload.pages) || 0)),
      total: Math.max(0, Math.trunc(Number(payload.total) || 0)),
      offsetLimitReached: payload.offsetLimitReached === true,
    };
  }

  private parseMarketTradeHeartbeat(data: unknown): MarketTradeStreamEvent {
    if (typeof data !== 'object' || data === null) {
      throw new Error('Unexpected market trade heartbeat response');
    }
    const payload = data as MarketTradeHeartbeatPayload;
    const conditionId = String(payload.conditionId || '').trim();
    if (!conditionId) throw new Error('Unexpected market trade heartbeat condition response');
    return {
      type: 'heartbeat',
      conditionId,
      at: String(payload.at || ''),
    };
  }

  private parseMarketTradeDone(data: unknown): MarketTradeStreamEvent {
    if (typeof data !== 'object' || data === null) {
      throw new Error('Unexpected market trade done response');
    }
    const payload = data as MarketTradeDonePayload;
    const conditionId = String(payload.conditionId || '').trim();
    if (!conditionId) throw new Error('Unexpected market trade done condition response');
    return {
      type: 'done',
      conditionId,
      reason: String(payload.reason || 'complete'),
    };
  }

  private normalizeMarketTrades(trades: unknown[]): MarketTradeTick[] {
    return trades.map((trade) => this.normalizeMarketTrade(trade)).filter((trade) => trade.id);
  }

  private normalizeMarketTrade(trade: unknown): MarketTradeTick {
    const item = (
      typeof trade === 'object' && trade !== null ? trade : {}
    ) as Partial<MarketTradeTick>;
    return {
      id: String(item.id || ''),
      tokenId: String(item.tokenId || ''),
      outcome: item.outcome,
      side: item.side,
      price: item.price,
      priceRaw: item.priceRaw,
      size: item.size,
      timestamp: item.timestamp,
      transactionHash: item.transactionHash,
      source: item.source === 'live' ? 'live' : 'history',
    };
  }

  private normalizeTokenIds(tokenIds: string[]): string[] {
    return [...new Set(tokenIds.map((tokenId) => String(tokenId || '').trim()).filter(Boolean))];
  }

  private errorMessageFromSseData(data: unknown): string {
    if (
      typeof data === 'object' &&
      data !== null &&
      'message' in data &&
      typeof data.message === 'string' &&
      data.message.trim()
    ) {
      return data.message.trim();
    }
    return 'Gamma stream returned an error';
  }
}

export { PolymarketGammaApiClient };
