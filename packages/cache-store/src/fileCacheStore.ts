import path from 'path';
import type { Low } from 'lowdb';
import { JSONFilePreset } from 'lowdb/node';
import type {
  CacheEntry,
  CacheLoader,
  CacheStore,
  FileCacheDatabase,
  FileCacheStoreOptions,
} from './types.js';

const DEFAULT_STORE_FILE = 'cache-store.json';

class FileCacheStore implements CacheStore {
  private readonly _storeFile: string;
  private _dbPromise: Promise<Low<FileCacheDatabase>> | null;
  private _writeQueue: Promise<void>;
  private readonly _pendingLoads: Map<string, Promise<unknown>>;

  public constructor(options: FileCacheStoreOptions = {}) {
    this._storeFile = options.storeFile ?? DEFAULT_STORE_FILE;
    this._dbPromise = null;
    this._writeQueue = Promise.resolve();
    this._pendingLoads = new Map<string, Promise<unknown>>();
  }

  public async initialize(userDataPath: string): Promise<void> {
    const storePath = path.join(userDataPath, this._storeFile);
    this._dbPromise = JSONFilePreset<FileCacheDatabase>(storePath, this._createDefaultData()).then(
      (db) => {
        db.data.entries ??= {};
        return db;
      },
    );
    await this._dbPromise;
  }

  public async getValue<T>(key: string): Promise<T | null> {
    const entry = await this._getEntry(key);
    if (!entry || !this._isFresh(entry)) return null;
    return entry.value as T;
  }

  public async setValue<T>(key: string, value: T, ttlMs: number | null): Promise<void> {
    this._assertValidKey(key);
    const normalizedTtlMs = this._normalizeTtlMs(ttlMs);
    const now = Date.now();

    await this._enqueueWrite(async (db) => {
      db.data.entries[key] = {
        value,
        updatedAt: now,
        expiresAt: this._resolveExpiresAt(now, normalizedTtlMs),
      };
    });
  }

  public async deleteValue(key: string): Promise<void> {
    this._assertValidKey(key);
    await this._enqueueWrite(async (db) => {
      delete db.data.entries[key];
    });
  }

  public async clearExpiredValues(now = Date.now()): Promise<void> {
    await this._enqueueWrite(async (db) => {
      for (const [key, entry] of Object.entries(db.data.entries)) {
        if (entry.expiresAt !== null && entry.expiresAt <= now) delete db.data.entries[key];
      }
    });
  }

  public async getOrSetValue<T>(
    key: string,
    ttlMs: number | null,
    loader: CacheLoader<T>,
  ): Promise<T> {
    const stored = await this._getEntry(key);
    if (stored && this._isFresh(stored)) return stored.value as T;

    const pending = this._pendingLoads.get(key);
    if (pending) return pending as Promise<T>;

    const loadPromise = this._loadAndCacheValue(key, ttlMs, loader);
    this._pendingLoads.set(key, loadPromise);
    try {
      return await loadPromise;
    } finally {
      this._pendingLoads.delete(key);
    }
  }

  private _createDefaultData(): FileCacheDatabase {
    return { entries: {} };
  }

  private _assertValidKey(key: string): void {
    if (!key.trim()) throw new Error('Cache key is required');
  }

  private _normalizeTtlMs(ttlMs: number | null): number | null {
    if (ttlMs === null) return null;
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new Error('Cache TTL must be a positive number or null');
    }
    return Math.trunc(ttlMs);
  }

  private _resolveExpiresAt(now: number, ttlMs: number | null): number | null {
    return ttlMs === null ? null : now + ttlMs;
  }

  private async _getDb(): Promise<Low<FileCacheDatabase>> {
    if (!this._dbPromise) throw new Error('File cache store is not initialized');
    const db = await this._dbPromise;
    db.data.entries ??= {};
    return db;
  }

  private async _enqueueWrite(
    operation: (db: Low<FileCacheDatabase>) => Promise<void>,
  ): Promise<void> {
    const run = this._writeQueue
      .catch(() => undefined)
      .then(async () => {
        const db = await this._getDb();
        await operation(db);
        await db.write();
      });
    this._writeQueue = run.then(
      () => undefined,
      () => undefined,
    );
    await run;
  }

  private _isFresh(entry: CacheEntry | undefined, now = Date.now()): entry is CacheEntry {
    return Boolean(entry && (entry.expiresAt === null || entry.expiresAt > now));
  }

  private async _getEntry(key: string): Promise<CacheEntry | null> {
    this._assertValidKey(key);
    const db = await this._getDb();
    return db.data.entries[key] ?? null;
  }

  private async _loadAndCacheValue<T>(
    key: string,
    ttlMs: number | null,
    loader: CacheLoader<T>,
  ): Promise<T> {
    try {
      const fresh = await loader();
      await this.setValue(key, fresh, ttlMs);
      return fresh;
    } catch (error) {
      const stale = await this._getEntry(key);
      if (stale) return stale.value as T;
      throw error;
    }
  }
}

export { FileCacheStore };
