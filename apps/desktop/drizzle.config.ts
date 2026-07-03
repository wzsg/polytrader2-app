import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: '../../packages/repositories/sqlite-repository/src/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: './.local/polytrader2.db',
  },
});
