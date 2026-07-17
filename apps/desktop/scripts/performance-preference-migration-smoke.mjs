import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeDb, createSqlitePreferenceRepository, initDb } from '@polytrader/sqlite-repository';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const migrationsFolder = path.join(workspaceRoot, 'apps', 'desktop', 'drizzle');

async function main() {
  const userDataPath = await mkdtemp(path.join(os.tmpdir(), 'polytrader-preference-migration-'));
  try {
    await initDb({ userDataPath, migrationsFolder });
    const preferences = await createSqlitePreferenceRepository().setPerformanceMonitoringEnabled(
      true,
      new Date().toISOString(),
    );
    if (preferences.performanceMonitoringEnabled !== true) {
      throw new Error('Performance monitoring preference was not migrated');
    }
    console.log('Performance monitoring preference migration passed');
  } finally {
    await closeDb();
    await rm(userDataPath, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
