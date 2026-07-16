import { defineConfig } from 'tsup';

const config = defineConfig({
  entry: { 'mcp-stdio-bridge': 'src/mcp-stdio-bridge/index.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  bundle: true,
  splitting: false,
  sourcemap: false,
  clean: true,
  outDir: 'out/mcp-stdio-bridge',
  noExternal: [/.*/u],
  external: [/^node:/u],
});

export default config;
