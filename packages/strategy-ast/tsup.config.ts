import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/ast.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: false,
  target: 'es2022',
  tsconfig: 'tsconfig.build.json',
});
