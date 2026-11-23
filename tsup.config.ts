import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'browser',
  target: 'es2022',
  dts: false,
  sourcemap: true,
  clean: true,
});
