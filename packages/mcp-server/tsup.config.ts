import { defineConfig } from 'tsup';

const config = defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: false,
  target: 'es2022',
  tsconfig: 'tsconfig.build.json',
  external: [
    '@hono/node-server',
    '@modelcontextprotocol/sdk',
    '@polytrader/repository-contract',
    '@polytrader/shared',
    '@polytrader/strategy-runtime',
    'hono',
    'zod',
  ],
});

export default config;
