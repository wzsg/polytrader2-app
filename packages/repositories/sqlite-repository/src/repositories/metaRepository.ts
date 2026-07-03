import { eq } from 'drizzle-orm';
import { getDb } from '../client.js';
import { appMeta } from '../schema/index.js';

class SqliteMetaRepository {
  private readonly _lastSyncKey = 'last_sync_at';

  public getMetaValue(key: string): string | null {
    const db = getDb();
    const row = db.select().from(appMeta).where(eq(appMeta.key, key)).get();
    return row?.value ?? null;
  }

  public setMetaValue(key: string, value: string): void {
    const db = getDb();
    db.insert(appMeta)
      .values({ key, value })
      .onConflictDoUpdate({
        target: appMeta.key,
        set: { value },
      })
      .run();
  }

  public deleteMetaValue(key: string): void {
    const db = getDb();
    db.delete(appMeta).where(eq(appMeta.key, key)).run();
  }

  public getLastSyncTime(): string | null {
    return this.getMetaValue(this._lastSyncKey);
  }

  public setLastSyncTime(iso = new Date().toISOString()): void {
    this.setMetaValue(this._lastSyncKey, iso);
  }
}

export { SqliteMetaRepository };
