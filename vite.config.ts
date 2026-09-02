import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Root is web/ so `vite build` emits web/dist, but this config file itself
// lives at the repo root so `npm run build` needs no --config flag (see
// api/server.mjs's own comment on where it expects the built output).
export default defineConfig({
  root: 'web',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./web/src', import.meta.url)),
      // The pre-Vue view modules under assets/js/ (compute.js, format.js,
      // config.js, tooltip.js, quest-*.js…) are framework-agnostic and
      // already covered by test/*.test.mjs — reused here rather than
      // ported, until the old static pages that also import them are
      // retired.
      '@shared': fileURLToPath(new URL('./assets/js', import.meta.url)),
      // styles.css is imported through Vite's own CSS pipeline (see
      // main.ts) rather than a <link> tag, so it participates in dev HMR
      // and gets bundled normally for production.
      '@css': fileURLToPath(new URL('./assets/css', import.meta.url)),
    },
  },
  server: {
    fs: {
      // @shared and its sibling assets/{css,icons}/ live outside web/,
      // which is Vite's dev-server root — without this, requests for files
      // under assets/ are refused as outside the allowed serving boundary.
      allow: ['..'],
    },
    proxy: {
      '/api': 'http://localhost:4173',
      '/auth': 'http://localhost:4173',
      '/healthz': 'http://localhost:4173',
    },
  },
  build: {
    outDir: 'dist',
    // Not the default 'assets' — the repo's own assets/ directory (icons,
    // styles.css, and the still-static /stats/ pages' own JS) is served at
    // the URL prefix /assets/ by api/server.mjs; Vite's default output
    // directory name would collide with that at the same prefix once dist
    // is mounted at '/'.
    assetsDir: '_app',
    emptyOutDir: true,
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.{test,spec}.ts'],
  },
});
