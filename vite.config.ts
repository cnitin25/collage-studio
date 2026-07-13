import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png', 'icon-maskable.png'],
      manifest: {
        name: 'Collage Studio',
        short_name: 'Collage',
        description: 'Offline photo collage editor — everything stays on your device.',
        theme_color: '#101218',
        background_color: '#101218',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,ico}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
  server: { port: 5173, open: true },
  build: {
    rollupOptions: {
      output: {
        // Konva rarely changes between releases but is a large chunk of the
        // bundle — splitting it out means an app-code update doesn't force
        // users to re-download it, and the two chunks fetch in parallel.
        manualChunks: {
          konva: ['konva', 'react-konva'],
        },
      },
    },
  },
});
