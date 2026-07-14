import type { CacheEntry, CacheLoader, CacheStore, MemoryCacheStoreOptions } from './types.js';

const DEFAULT_MEMORY_CACHE_MAX_ENTRIES = 128;

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

export { MemoryCacheStore };
