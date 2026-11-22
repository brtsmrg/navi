/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// base './' keeps one build working at a domain root, under a GitHub Pages sub-path, and inside the native shells.
export default defineConfig({
  base: './',
  plugins: [
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
      workbox: { navigateFallback: 'index.html', globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] },
    }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { target: 'es2022', sourcemap: false },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
