import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type * as schema from './schema/index.js';

export function runMigrations(
  db: BetterSQLite3Database<typeof schema>,
  migrationsFolder: string,
): void {
  migrate(db, { migrationsFolder });
}
