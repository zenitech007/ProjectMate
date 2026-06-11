import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        includeAssets: ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png', 'logo.png'],
        manifest: {
          name: 'ProjectMate – Nigerian Student Project Assistant',
          short_name: 'ProjectMate',
          description: 'AI-powered academic project assistant for Nigerian students',
          start_url: '/',
          display: 'standalone',
          background_color: '#f8fafc',
          theme_color: '#15803d',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          ],
        },
        workbox: {
          // FIX 3: Only precache the app shell (HTML, CSS, core JS).
          // Large on-demand chunks like jsPDF, docx, TipTap, Firebase are
          // excluded from precache. They are cached at runtime the first time
          // they are actually needed, not on install.
          // Before: 49 entries, 4.1 MB precached — slow install, no benefit
          // After:  ~12 entries, ~400 kB precached — fast install
          globPatterns: ['**/*.{html,css}', '**/vendor-{dnd,purify}-*.js', '**/index-*.js'],
          globIgnores: [
            '**/vendor-firebase-*.js',   // large, has own caching via SDK
            '**/vendor-editor-*.js',      // only needed on /editor
            '**/jspdf.*.js',              // on-demand export
            '**/html2canvas.*.js',        // on-demand export
            '**/index.es-*.js',           // on-demand export (docx)
            '**/PaymentModal-*.js',       // only shown on payment trigger
            '**/vendor-paystack-*.js',    // isolated paystack chunk
          ],
          runtimeCaching: [
            // Firebase vendor chunk — cache on first use, update in background
            {
              urlPattern: /\/assets\/vendor-firebase-.*\.js$/,
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'vendor-firebase', expiration: { maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 30 } },
            },
            // TipTap editor — cache on first editor open
            {
              urlPattern: /\/assets\/vendor-editor-.*\.js$/,
              handler: 'CacheFirst',
              options: { cacheName: 'vendor-editor', expiration: { maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 30 } },
            },
            // Export libs (jsPDF, html2canvas, docx) — cache after first export
            {
              urlPattern: /\/assets\/(jspdf|html2canvas|index\.es)-.*\.js$/,
              handler: 'CacheFirst',
              options: { cacheName: 'vendor-export', expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 30 } },
            },
            // PaymentModal
            {
              urlPattern: /\/assets\/PaymentModal-.*\.js$/,
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'vendor-payment', expiration: { maxEntries: 2 } },
            },
            // Paystack SDK chunk
            {
              urlPattern: /\/assets\/vendor-paystack-.*\.js$/,
              handler: 'CacheFirst', // Paystack SDK is stable; cache it aggressively
              options: {
                cacheName: 'vendor-paystack',
                expiration: { maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 30 }
              },
            },
            // Google Fonts
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'google-fonts-stylesheets' },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: { cacheName: 'google-fonts-webfonts', cacheableResponse: { statuses: [0, 200] } },
            },
            // Never cache these — they have their own mechanisms or must be fresh
            { urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i, handler: 'NetworkOnly' },
            { urlPattern: /^https:\/\/identitytoolkit\.googleapis\.com\/.*/i, handler: 'NetworkOnly' },
            { urlPattern: /^https:\/\/us-central1-.+\.cloudfunctions\.net\/.*/i, handler: 'NetworkOnly' },
            { urlPattern: /^https:\/\/.*paystack\.com\/.*/i, handler: 'NetworkOnly' },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            // FIX 1: Do NOT manually chunk react/react-dom.
            // Doing so causes a circular dependency: vendor-misc → react → vendor-misc.
            // Rollup handles React placement correctly on its own.

            // Firebase
            if (id.includes('node_modules/firebase/') || id.includes('node_modules/@firebase/')) {
              return 'vendor-firebase';
            }
            // TipTap + ProseMirror — only loaded on /editor route
            if (id.includes('node_modules/@tiptap/') || id.includes('node_modules/prosemirror')) {
              return 'vendor-editor';
            }
            // FIX 2: Do NOT manually chunk docx/jsPDF/html2canvas here.
            // They are dynamically imported inside exportService.ts, so Rollup
            // already splits them into separate on-demand chunks automatically.
            // Manually chunking them here conflicts and causes double-bundling.

            // DnD kit
            if (id.includes('node_modules/@dnd-kit/')) {
              return 'vendor-dnd';
            }
            // DOMPurify
            if (id.includes('node_modules/dompurify')) {
              return 'vendor-purify';
            }
            // FIX: Lazy-loaded PaymentModal pulls in react-paystack which
            // bundles the entire Paystack inline script (~120 kB). Isolate it
            // so it doesn't inflate other chunks.
            if (id.includes('node_modules/react-paystack') || id.includes('node_modules/@paystack')) {
              return 'vendor-paystack';
            }
            if (id.includes('node_modules/lucide-react')) {
              return 'vendor-icons';
            }
          },
        },
      },
    },
  };
});