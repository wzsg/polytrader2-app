import { count, desc, eq } from 'drizzle-orm';
import { getDb } from '../client.js';
import { events, watchlist } from '../schema/index.js';

class SqliteWatchlistRepository {
  public getWatchlistEventIds(): string[] {
    const db = getDb();
    const rows = db
      .select({ eventId: watchlist.eventId })
      .from(watchlist)
      .orderBy(desc(watchlist.createdAt))
      .all();
    return rows.map((row) => row.eventId);
  }

  public addToWatchlist(eventId: string): boolean {
    const db = getDb();
    const id = String(eventId);
    const exists = db.select({ id: events.id }).from(events).where(eq(events.id, id)).get();
    if (!exists) return false;
    db.insert(watchlist).values({ eventId: id }).onConflictDoNothing().run();
    return true;
  }

  public removeFromWatchlist(eventId: string): void {
    const db = getDb();
    db.delete(watchlist)
      .where(eq(watchlist.eventId, String(eventId)))
      .run();
  }

  public countWatchlist(): number {
    const db = getDb();
    const row = db.select({ cnt: count() }).from(watchlist).get();
    return row?.cnt ?? 0;
  }

  public countOpenWatchlistEvents(): number {
    const db = getDb();
    const row = db
      .select({ cnt: count() })
      .from(watchlist)
      .innerJoin(events, eq(watchlist.eventId, events.id))
      .where(eq(events.closed, false))
      .get();
    return row?.cnt ?? 0;
  }
}

export { SqliteWatchlistRepository };
