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
    '@polytrader/bot-runtime-contract',
    '@polytrader/polymarket-api',
    '@polytrader/repository-contract',
    '@polytrader/shared',
    '@polytrader/sqlite-repository',
    'typescript',
  ],
});

export default config;
