import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    strategyWorker: 'src/strategyWorker.ts',
    workerProtocol: 'src/workerProtocol.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: false,
  target: 'node24',
  platform: 'node',
  external: ['isolated-vm'],
  noExternal: ['@polytrader/bot-runtime-contract'],
  tsconfig: 'tsconfig.build.json',
});
