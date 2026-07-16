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

export type {
  CacheEntry,
  CacheLoader,
  CacheStore,
  FileCacheDatabase,
  FileCacheStoreOptions,
  MemoryCacheStoreOptions,
};
