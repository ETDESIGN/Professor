import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Mirror the vercel.json portal rewrites ("/teacher/:path*" → /teacher, …)
// for `vite dev` AND `vite preview`. Without this, deep portal paths like
// /teacher/unit/<id> fall back to the hub entry (index.html); the hub's
// <PortalRedirect> then full-page-replaces to the same URL to hand off to
// the portal entry, gets the hub again, and reload-loops ~20×/s (the parked
// "dev-server reload loop on direct portal goto" audit item). Production
// (Vercel) is unaffected — its rewrites serve the portal entry directly.
// NOTE: this used to live under `server.configureServer`, which is NOT a
// config option (it's a plugin hook) — Vite silently ignored it and the
// middleware never ran.
const PORTALS = ['/student', '/teacher', '/parent', '/admin'];
const portalRewriteMiddleware = (middlewares: any) => {
  middlewares.use((req: any, _res: any, next: any) => {
    const url = req.url?.split('?')[0] ?? '';
    const portal = PORTALS.find(p => url === p || url.startsWith(p + '/'));
    if (portal && !path.extname(url)) {
      req.url = portal + '.html';
    }
    next();
  });
};
const portalEntryRewrites = () => ({
  name: 'portal-entry-rewrites',
  configureServer(server: any) { portalRewriteMiddleware(server.middlewares); },
  configurePreviewServer(server: any) { portalRewriteMiddleware(server.middlewares); },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          teacher: path.resolve(__dirname, 'teacher.html'),
          student: path.resolve(__dirname, 'student.html'),
          parent: path.resolve(__dirname, 'parent.html'),
          admin: path.resolve(__dirname, 'admin.html'),
        },
        output: {
          manualChunks: {
            'react-player': ['react-player/lazy'],
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-charts': ['recharts'],
            'vendor-dnd': ['@hello-pangea/dnd'],
            'vendor-motion': ['framer-motion'],
            'vendor-supabase': ['@supabase/supabase-js'],
          }
        }
      }
    },
    plugins: [
      portalEntryRewrites(),
      react(),
      // PWA UPDATE BEHAVIOR — load-bearing config, do not change without
      // reading AGENTS.md §8.1 ("Deploy update behavior").
      // `prompt` (not `autoUpdate`): a new SW installs and enters `waiting`,
      // then fires `onNeedRefresh`. <UpdatePrompt /> shows a "Reload" banner so
      // the user picks when to reload — critical for a live-classroom tool where
      // an uncontrolled mid-lesson reload would lose session state.
      // NOTE: `skipWaiting: true` is deliberately OMITTED. With it, the generated
      // SW calls self.skipWaiting() on install, bypassing `waiting` and making
      // `prompt` mode silently act like autoUpdate (the bug we're fixing). The
      // generated SW still ships a SKIP_WAITING message handler, so the prompt's
      // "Reload" button (messageSkipWaiting via updateServiceWorker) works.
      VitePWA({
        registerType: 'prompt',
        includeAssets: [],
        manifest: {
          name: 'Lesson Orchestrator',
          short_name: 'Lessons',
          description: 'Interactive lesson platform for students and teachers',
          theme_color: '#ffffff',
          icons: [
            {
              src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="%234f46e5"/><text x="256" y="340" font-size="280" text-anchor="middle" fill="white" font-family="sans-serif" font-weight="bold">P</text></svg>',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any maskable'
            }
          ]
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 5000000,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          cleanupOutdatedCaches: true,
          // `skipWaiting: true` intentionally omitted — see the PWA UPDATE BEHAVIOR
          // comment above the VitePWA() call. clientsClaim alone is safe: it only
          // makes the SW control clients AFTER it activates (it does not force
          // activation on install).
          clientsClaim: true,
          navigateFallbackDenylist: [
            /^\/api\/.*/,
            /^\/auth\/.*/,
            /^\/rest\/.*/,
            /^\/realtime\/.*/,
            /^\/functions\/.*/,
            // Portals are separate entries served by vercel.json rewrites —
            // the hub SW must never answer their navigations (stale-shell bug).
            // `(?:\/|$)` also matches the bare prefix (e.g. exactly /student).
            /^\/student(?:\/|$)/,
            /^\/teacher(?:\/|$)/,
            /^\/parent(?:\/|$)/,
            /^\/admin(?:\/|$)/,
          ],
          navigateFallback: '/index.html',
          runtimeCaching: [
            {
              // NetworkFirst: SW gracefully falls back to cache when network/CSP blocks
              // the request, preventing uncaught errors in the dicebear CSP console flood.
              urlPattern: /^https:\/\/api\.dicebear\.com\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'dicebear-avatars',
                networkTimeoutSeconds: 3,
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24 * 30
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-stylesheets',
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [0, 200] }
              }
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-webfonts',
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] }
              }
            }
          ]
        },
        devOptions: {
          enabled: false
        }
      })
    ],
    define: {
      // CRITICAL: Do NOT inject API keys into client bundle.
      // All AI calls go through Supabase Edge Functions for security.
    },
    optimizeDeps: {
      exclude: ['@google/genai']
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
