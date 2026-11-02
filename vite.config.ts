import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import vercel from './vercel.json' with { type: 'json' };

// `npm run preview` serves the production build with the same security
// headers (CSP included) as Vercel, so a policy problem shows up locally
// rather than in production. vercel.json stays the one place they're defined.
const securityHeaders = Object.fromEntries(
  (vercel.headers.find((rule) => rule.source === '/(.*)')?.headers ?? []).map((h) => [h.key, h.value]),
);

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-maskable.png'],
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
  preview: { headers: securityHeaders },
  build: {
    // The oldest browsers the app runs in at all (structuredClone and dvh
    // need them), rather than Vite's default, which would also drop
    // iOS 15.4–16.3 — the newest iOS some older iPhones can run.
    target: ['chrome98', 'edge98', 'firefox94', 'safari15.4'],
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Konva rarely changes between releases but is a large chunk of the
          // bundle — splitting it out means an app-code update doesn't force
          // users to re-download it, and the two chunks fetch in parallel.
          groups: [{ name: 'konva', test: /node_modules[\\/](konva|react-konva|react-reconciler|its-fine)[\\/]/ }],
        },
      },
    },
  },
});
