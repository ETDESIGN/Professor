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
      react(),
      VitePWA({
        registerType: 'autoUpdate',
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
          navigateFallbackDenylist: [/^\/upload/],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/api\.dicebear\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'dicebear-avatars',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 * 30
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
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
