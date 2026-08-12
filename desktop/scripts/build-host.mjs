import { build } from 'esbuild';

const shared = {
  bundle: true,
  external: ['electron'],
  logLevel: 'info',
  minify: false,
  platform: 'node',
  sourcemap: true,
  target: 'node24',
};

await Promise.all([
  build({
    ...shared,
    entryPoints: ['src/main/index.ts'],
    format: 'esm',
    outfile: 'dist/main/index.js',
  }),
  build({
    ...shared,
    entryPoints: ['src/preload/index.ts'],
    format: 'cjs',
    outfile: 'dist/preload/index.cjs',
  }),
]);
