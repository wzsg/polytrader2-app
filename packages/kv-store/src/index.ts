import path from 'path';
import type { Low } from 'lowdb';
import { JSONFilePreset } from 'lowdb/node';

interface KvStoreEntry {
  value: unknown;
  updatedAt: number;
  expiresAt: number | null;
}

interface KvStoreDatabase {
  entries: Record<string, KvStoreEntry>;
}

interface KvStoreOptions {
  storeFile?: string;
}

type KvStoreLoader<T> = () => Promise<T>;

const DEFAULT_STORE_FILE = 'kv-store.json';

class KvStore {
  private readonly _storeFile: string;
  private _dbPromise: Promise<Low<KvStoreDatabase>> | null;
  private _writeQueue: Promise<void>;
  private readonly _pendingLoads: Map<string, Promise<unknown>>;

  public constructor(options: KvStoreOptions = {}) {
    this._storeFile = options.storeFile ?? DEFAULT_STORE_FILE;
    this._dbPromise = null;
    this._writeQueue = Promise.resolve();
    this._pendingLoads = new Map<string, Promise<unknown>>();
  }

  public async initialize(userDataPath: string): Promise<void> {
    const storePath = path.join(userDataPath, this._storeFile);
    this._dbPromise = JSONFilePreset<KvStoreDatabase>(storePath, this.createDefaultData()).then(
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
    loader: KvStoreLoader<T>,
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

  private createDefaultData(): KvStoreDatabase {
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

  private async getDb(): Promise<Low<KvStoreDatabase>> {
    if (!this._dbPromise) {
      throw new Error('KV store is not initialized');
    }

    const db = await this._dbPromise;
    db.data.entries ??= {};
    return db;
  }

  private async enqueueWrite(
    operation: (db: Low<KvStoreDatabase>) => Promise<void>,
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

  private isFresh(entry: KvStoreEntry | undefined, now = Date.now()): entry is KvStoreEntry {
    return Boolean(entry && (entry.expiresAt === null || entry.expiresAt > now));
  }

  private async getEntry(key: string): Promise<KvStoreEntry | null> {
    this.assertValidKey(key);
    const db = await this.getDb();
    return db.data.entries[key] ?? null;
  }

  private async loadAndCacheValue<T>(
    key: string,
    ttlMs: number | null,
    loader: KvStoreLoader<T>,
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

export { KvStore };
export type { KvStoreDatabase, KvStoreEntry, KvStoreLoader, KvStoreOptions };
