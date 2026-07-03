import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { createGunzip } from 'node:zlib';
import {
  POLYTRADER_EVENT_SNAPSHOT_BASE_URL,
  type AppLocale,
  type GammaEventRaw,
} from '@polytrader/shared';
import type { GammaStreamPage } from '../gamma/index.js';
import type { R2EventSnapshotLatest } from './types.js';

const DEFAULT_EVENT_SNAPSHOT_LATEST_KEY = 'polymarket-gamma/latest.json';
const ZH_CN_EVENT_SNAPSHOT_LATEST_KEY = 'polymarket-gamma/latest.zh-CN.json';
const DEFAULT_EVENT_SNAPSHOT_BATCH_SIZE = 100;

class R2EventSnapshotClient {
  private readonly _baseUrl: string;
  private readonly _latestKey: string;
  private readonly _batchSize: number;

  public constructor(
    baseUrl = POLYTRADER_EVENT_SNAPSHOT_BASE_URL,
    latestKey = DEFAULT_EVENT_SNAPSHOT_LATEST_KEY,
    batchSize = DEFAULT_EVENT_SNAPSHOT_BATCH_SIZE,
  ) {
    this._baseUrl = baseUrl.replace(/\/+$/, '');
    this._latestKey = latestKey.replace(/^\/+/, '');
    this._batchSize = Math.max(1, Math.trunc(batchSize));
  }

  public async *streamOpenEvents(
    signal: AbortSignal,
    locale: AppLocale = 'en-US',
  ): AsyncGenerator<GammaStreamPage> {
    const snapshotKey = await this.fetchLatestSnapshotKey(signal, locale);
    const res = await fetch(this.objectUrl(snapshotKey), { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    if (!res.body) throw new Error('R2 event snapshot response did not include a body');

    const body = Readable.fromWeb(res.body as unknown as NodeReadableStream<Uint8Array>);
    const gunzip = createGunzip();
    const contentEncoding = res.headers.get('content-encoding')?.toLowerCase() || '';
    const input = contentEncoding.includes('gzip') ? body : body.pipe(gunzip);
    const lines = createInterface({
      input,
      crlfDelay: Infinity,
    });
    const abort = () => {
      const error = this.createAbortError();
      body.destroy(error);
      gunzip.destroy(error);
      lines.close();
    };

    signal.addEventListener('abort', abort, { once: true });
    try {
      let events: GammaEventRaw[] = [];
      let pendingLine: string | null = null;
      for await (const line of lines) {
        if (signal.aborted) throw this.createAbortError();
        if (pendingLine === null && !line.trim()) continue;

        const event = this.parseSnapshotLine(line, pendingLine);
        if (event === null) {
          pendingLine = pendingLine === null ? line : `${pendingLine}\\n${line}`;
          continue;
        }

        pendingLine = null;
        events.push(event);
        if (events.length >= this._batchSize) {
          yield { events };
          events = [];
        }
      }

      if (pendingLine !== null) {
        events.push(JSON.parse(pendingLine) as GammaEventRaw);
      }
      if (events.length) yield { events };
    } finally {
      signal.removeEventListener('abort', abort);
      lines.close();
      body.destroy();
      gunzip.destroy();
    }
  }

  private async fetchLatestSnapshotKey(signal: AbortSignal, locale: AppLocale): Promise<string> {
    const res = await fetch(this.objectUrl(this.latestKeyForLocale(locale)), { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

    const data = (await res.json()) as R2EventSnapshotLatest;
    const key = data.snapshot?.key;
    if (typeof key !== 'string' || !key.trim()) {
      throw new Error('R2 latest.json did not include a snapshot key');
    }
    return key;
  }

  private objectUrl(key: string): string {
    return `${this._baseUrl}/${key.replace(/^\/+/, '')}`;
  }

  private latestKeyForLocale(locale: AppLocale): string {
    return locale === 'zh-CN' ? ZH_CN_EVENT_SNAPSHOT_LATEST_KEY : this._latestKey;
  }

  private parseSnapshotLine(line: string, pendingLine: string | null): GammaEventRaw | null {
    const candidate = pendingLine === null ? line : `${pendingLine}\\n${line}`;
    if (!candidate.trim()) return null;

    try {
      return JSON.parse(candidate) as GammaEventRaw;
    } catch {
      return null;
    }
  }

  private createAbortError(): Error {
    const error = new Error('The operation was aborted');
    error.name = 'AbortError';
    return error;
  }
}

export { R2EventSnapshotClient };
