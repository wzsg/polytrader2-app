import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { migrateSqliteDatabase } from '@polytrader/sqlite-repository';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const migrationsFolder = join(projectRoot, 'drizzle');

const targets = process.argv.slice(2);
if (!targets.length) {
  console.error('Usage: migrate-db.mjs <db-path> [db-path...]');
  process.exit(1);
}

for (const dbPath of targets) {
  const result = migrateSqliteDatabase({ dbPath, migrationsFolder });
  console.log(`Migrated ${dbPath}`);
  console.log(`  tables: ${result.tables.join(', ')}`);
}
