import path from 'path';
import type { Low } from 'lowdb';
import { JSONFilePreset } from 'lowdb/node';

interface CacheEntry {
  value: unknown;
  updatedAt: number;
  expiresAt: number | null;
}

interface FileCacheDatabase {
  entries: Record<string, CacheEntry>;
}

interface FileCacheStoreOptions {
  storeFile?: string;
}

interface MemoryCacheStoreOptions {
  maxEntries?: number;
}

type CacheLoader<T> = () => Promise<T>;

interface CacheStore {
  getValue<T>(key: string): Promise<T | null>;
  setValue<T>(key: string, value: T, ttlMs: number | null): Promise<void>;
  deleteValue(key: string): Promise<void>;
  getOrSetValue<T>(key: string, ttlMs: number | null, loader: CacheLoader<T>): Promise<T>;
}

const DEFAULT_STORE_FILE = 'cache-store.json';
const DEFAULT_MEMORY_CACHE_MAX_ENTRIES = 128;

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
    this._dbPromise = JSONFilePreset<FileCacheDatabase>(storePath, this.createDefaultData()).then(
      (db) => {
        db.data.entries ??= {};
        return db;
      },
    );
    await this._dbPromise;
  }

  public async getValue<T>(key: string): Promise<T | null> {
    const entry = await this.getEntry(key);
    if (!entry || !this.isFresh(entry)) return null;
    return entry.value as T;
  }

  public async setValue<T>(key: string, value: T, ttlMs: number | null): Promise<void> {
    this.assertValidKey(key);
    const normalizedTtlMs = this.normalizeTtlMs(ttlMs);
    const now = Date.now();

    await this.enqueueWrite(async (db) => {
      db.data.entries[key] = {
        value,
        updatedAt: now,
        expiresAt: this.resolveExpiresAt(now, normalizedTtlMs),
      };
    });
  }

  public async deleteValue(key: string): Promise<void> {
    this.assertValidKey(key);
    await this.enqueueWrite(async (db) => {
      delete db.data.entries[key];
    });
  }

  public async clearExpiredValues(now = Date.now()): Promise<void> {
    await this.enqueueWrite(async (db) => {
      for (const [key, entry] of Object.entries(db.data.entries)) {
        if (entry.expiresAt !== null && entry.expiresAt <= now) {
          delete db.data.entries[key];
        }
      }
    });
  }

  public async getOrSetValue<T>(
    key: string,
    ttlMs: number | null,
    loader: CacheLoader<T>,
  ): Promise<T> {
    const stored = await this.getEntry(key);
    if (stored && this.isFresh(stored)) return stored.value as T;

    const pending = this._pendingLoads.get(key);
    if (pending) return pending as Promise<T>;

    const loadPromise = this.loadAndCacheValue(key, ttlMs, loader);
    this._pendingLoads.set(key, loadPromise);

    try {
      return await loadPromise;
    } finally {
      this._pendingLoads.delete(key);
    }
  }

  private createDefaultData(): FileCacheDatabase {
    return { entries: {} };
  }

  private assertValidKey(key: string): void {
    if (!key.trim()) {
      throw new Error('KV key is required');
    }
  }

  private normalizeTtlMs(ttlMs: number | null): number | null {
    if (ttlMs === null) {
      return null;
    }
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new Error('KV TTL must be a positive number or null');
    }
    return Math.trunc(ttlMs);
  }

  private resolveExpiresAt(now: number, ttlMs: number | null): number | null {
    return ttlMs === null ? null : now + ttlMs;
  }

  private async getDb(): Promise<Low<FileCacheDatabase>> {
    if (!this._dbPromise) {
      throw new Error('KV store is not initialized');
    }

    const db = await this._dbPromise;
    db.data.entries ??= {};
    return db;
  }

  private async enqueueWrite(
    operation: (db: Low<FileCacheDatabase>) => Promise<void>,
  ): Promise<void> {
    const run = this._writeQueue
      .catch(() => undefined)
      .then(async () => {
        const db = await this.getDb();
        await operation(db);
        await db.write();
      });

    this._writeQueue = run.then(
      () => undefined,
      () => undefined,
    );

    return run;
  }

  private isFresh(entry: CacheEntry | undefined, now = Date.now()): entry is CacheEntry {
    return Boolean(entry && (entry.expiresAt === null || entry.expiresAt > now));
  }

  private async getEntry(key: string): Promise<CacheEntry | null> {
    this.assertValidKey(key);
    const db = await this.getDb();
    return db.data.entries[key] ?? null;
  }

  private async loadAndCacheValue<T>(
    key: string,
    ttlMs: number | null,
    loader: CacheLoader<T>,
  ): Promise<T> {
    try {
      const fresh = await loader();
      await this.setValue(key, fresh, ttlMs);
      return fresh;
    } catch (err) {
      const stale = await this.getEntry(key);
      if (stale) return stale.value as T;
      throw err;
    }
  }
}

class MemoryCacheStore implements CacheStore {
  private readonly _entries: Map<string, CacheEntry>;
  private readonly _pendingLoads: Map<string, Promise<unknown>>;
  private readonly _maxEntries: number;

  public constructor(options: MemoryCacheStoreOptions = {}) {
    this._entries = new Map();
    this._pendingLoads = new Map();
    this._maxEntries = this._normalizeMaxEntries(options.maxEntries);
  }

  public async getValue<T>(key: string): Promise<T | null> {
    const entry = this._getFreshEntry(key);
    return entry ? (entry.value as T) : null;
  }

  public async setValue<T>(key: string, value: T, ttlMs: number | null): Promise<void> {
    this._assertValidKey(key);
    const now = Date.now();
    this._entries.delete(key);
    this._entries.set(key, {
      value,
      updatedAt: now,
      expiresAt: this._resolveExpiresAt(now, this._normalizeTtlMs(ttlMs)),
    });
    this._evictOverflow();
  }

  public async deleteValue(key: string): Promise<void> {
    this._assertValidKey(key);
    this._entries.delete(key);
  }

  public async getOrSetValue<T>(
    key: string,
    ttlMs: number | null,
    loader: CacheLoader<T>,
  ): Promise<T> {
    const stored = this._getFreshEntry(key);
    if (stored) return stored.value as T;

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

  public clear(): void {
    this._entries.clear();
  }

  private _assertValidKey(key: string): void {
    if (!key.trim()) throw new Error('Cache key is required');
  }

  private _normalizeMaxEntries(maxEntries: number | undefined): number {
    const candidate = maxEntries ?? DEFAULT_MEMORY_CACHE_MAX_ENTRIES;
    if (!Number.isInteger(candidate) || candidate <= 0) {
      throw new Error('Memory cache maxEntries must be a positive integer');
    }
    return candidate;
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

  private _getFreshEntry(key: string): CacheEntry | null {
    this._assertValidKey(key);
    const entry = this._entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this._entries.delete(key);
      return null;
    }
    this._entries.delete(key);
    this._entries.set(key, entry);
    return entry;
  }

  private _evictOverflow(): void {
    while (this._entries.size > this._maxEntries) {
      const oldestKey = this._entries.keys().next().value;
      if (!oldestKey) return;
      this._entries.delete(oldestKey);
    }
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
      const stale = this._entries.get(key);
      if (stale) return stale.value as T;
      throw error;
    }
  }
}

export { FileCacheStore, MemoryCacheStore };
export type {
  CacheEntry,
  CacheLoader,
  CacheStore,
  FileCacheDatabase,
  FileCacheStoreOptions,
  MemoryCacheStoreOptions,
};
