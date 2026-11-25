/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// base './' keeps one build working at a domain root, under a GitHub Pages sub-path, and inside the native shells.
const BUILD = `${(process.env.GITHUB_SHA ?? 'local').slice(0, 7)} ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`;

export default defineConfig({
  base: './',
  plugins: [
    { name: 'navi-version', generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.txt', source: BUILD }); } },
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Navi Rally',
        short_name: 'Navi',
        description: 'Rally co-driver pacenotes for any road.',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: 'index.html',
        // opening the licence, robots or version text in a tab must show that file, not the app
        navigateFallbackDenylist: [/\.txt$/],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // the default recorded voice ships with the app; the other voices are kept after first use
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}', 'voices/george.{mp3,json}', 'licenses.txt'],
        globIgnores: ['voices/{michael,emma,heart}.*', 'assets/kokoro.worker-*', 'assets/*.wasm'],
        // map tiles you have already looked at keep working with no signal (the style and tiles are public OpenFreeMap files)
        runtimeCaching: [
          {
            urlPattern: ({ url }: { url: URL }) => /\/voices\/[a-z]+\.(mp3|json)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'navi-voices', cacheableResponse: { statuses: [200] } },
          },
          {
            // the free on-phone voice engine (kept after first use, so it works with no signal)
            urlPattern: ({ url }: { url: URL }) => /\/assets\/(kokoro\.worker-.*\.js|.*\.wasm)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'navi-voice-engine', cacheableResponse: { statuses: [200] } },
          },
          {
            urlPattern: ({ url }: { url: URL }) => url.origin === 'https://tiles.openfreemap.org',
            handler: 'CacheFirst',
            options: { cacheName: 'navi-map-tiles', expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 30 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  define: { __BUILD__: JSON.stringify(BUILD) },
  build: { target: 'es2022', sourcemap: false },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
