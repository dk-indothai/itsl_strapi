import { defineConfig } from 'tsup';

const external = [
  '@strapi/strapi',
  '@strapi/strapi/admin',
  '@strapi/design-system',
  'react',
  'react-dom',
  'react-intl',
  'styled-components',
];

export default defineConfig([
  {
    entry: { index: 'admin/src/index.ts' },
    outDir: 'dist/admin',
    format: ['esm', 'cjs'],
    outExtension({ format }) {
      return { js: format === 'esm' ? '.mjs' : '.js' };
    },
    dts: true,
    sourcemap: true,
    clean: true,
    external,
    splitting: false,
    treeshake: true,
  },
  {
    entry: { index: 'server/src/index.ts' },
    outDir: 'dist/server',
    format: ['esm', 'cjs'],
    outExtension({ format }) {
      return { js: format === 'esm' ? '.mjs' : '.js' };
    },
    dts: true,
    sourcemap: true,
    clean: true,
    external,
  },
]);
