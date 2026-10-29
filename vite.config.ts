import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

// GitHub Pages serves the app from /<repo>/, so built asset paths are relative.
export default defineConfig({
  base: './',
  build: {
    // The board, plus the page phones open in Board + phones games.
    rollupOptions: { input: { main: 'index.html', phone: 'phone.html' } },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Hex Board',
        short_name: 'Hex Board',
        description: 'A touch-screen board companion for hex-tile board games.',
        start_url: './',
        scope: './',
        display: 'standalone',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'any',
        background_color: '#0a1626',
        theme_color: '#0a1626',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
});
