import { join } from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema/index.js';
import { runMigrations } from './migrate.js';

const DB_FILE = 'polytrader2.db';

let sqlite: Database.Database | null = null;
let db: BetterSQLite3Database<typeof schema> | null = null;

interface InitDirectDbOptions {
  userDataPath: string;
  migrationsFolder: string;
}

function initDirectDb(options: InitDirectDbOptions): Database.Database {
  if (sqlite) return sqlite;

  const dbPath = join(options.userDataPath, DB_FILE);
  sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');

  db = drizzle(sqlite, { schema });
  runMigrations(db, options.migrationsFolder);

  return sqlite;
}

function closeDirectDb(): void {
  if (!sqlite) return;
  sqlite.close();
  sqlite = null;
  db = null;
}

function getDb(): BetterSQLite3Database<typeof schema> {
  if (!db) throw new Error('Database not initialized');
  return db;
}

function getSqlite(): Database.Database {
  if (!sqlite) throw new Error('Database not initialized');
  return sqlite;
}

export { closeDirectDb, getDb, getSqlite, initDirectDb };
export type { InitDirectDbOptions };
