import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/schema/index.ts', 'src/sqliteWorker.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: false,
  target: 'es2022',
  tsconfig: 'tsconfig.build.json',
  external: [
    '@polytrader/repository-contract',
    '@polytrader/shared',
    'better-sqlite3',
    'drizzle-orm',
    'drizzle-orm/better-sqlite3',
    'drizzle-orm/better-sqlite3/migrator',
    'drizzle-orm/sqlite-core',
  ],
});
