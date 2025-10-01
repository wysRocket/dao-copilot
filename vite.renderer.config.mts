import path from 'path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import {defineConfig} from 'vite'

export default defineConfig(({mode}) => ({
  plugins: [
    tailwindcss(),
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']]
      }
    })
  ],
  optimizeDeps: {
    include: ['liquid-glass-react']
  },
  define: {
    // Minimal defines for Electron renderer
    global: 'globalThis',
    // Environment variables for conditional compilation
    __DEV__: mode === 'development',
    __PROD__: mode === 'production'
  },
  resolve: {
    preserveSymlinks: true,
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  build: {
    // Production optimizations
    minify: mode === 'production' ? 'esbuild' : false,
    sourcemap: mode === 'development',
    rollupOptions: {
      output: {
        // Enhanced chunk splitting for better performance and caching
        manualChunks: id => {
          // Vendor chunks for node_modules
          if (id.includes('node_modules')) {
            // React ecosystem gets its own chunk
            if (id.includes('react') || id.includes('@react')) {
              return 'react-vendor'
            }
            // UI library chunks
            if (id.includes('@radix-ui') || id.includes('lucide-react')) {
              return 'ui-vendor'
            }
            // Electron-specific dependencies
            if (id.includes('electron')) {
              return 'electron-vendor'
            }
            // Large processing libraries
            if (id.includes('audio') || id.includes('speech') || id.includes('worker')) {
              return 'processing-vendor'
            }
            return 'vendor'
          }

          // Application chunks - more granular splitting
          if (
            id.includes('src/audio') ||
            id.includes('src/transcription') ||
            id.includes('audio-processing')
          ) {
            return 'audio-processing'
          }

          if (id.includes('src/workers') || id.includes('worker')) {
            return 'workers'
          }

          if (id.includes('src/components') || id.includes('src/ui')) {
            return 'ui-components'
          }

          if (id.includes('src/utils') || id.includes('src/services')) {
            return 'utils-services'
          }

          // AI and chat functionality
          if (
            id.includes('src/api') ||
            id.includes('gemini') ||
            id.includes('openai') ||
            id.includes('chat')
          ) {
            return 'ai-services'
          }

          // State management and contexts
          if (id.includes('src/contexts') || id.includes('src/state') || id.includes('store')) {
            return 'state-management'
          }

          // Large feature pages
          if (id.includes('src/pages') || id.includes('src/routes')) {
            return 'pages'
          }

          // Network and connection handling
          if (id.includes('src/connection') || id.includes('websocket') || id.includes('network')) {
            return 'networking'
          }

          // Error handling and telemetry
          if (
            id.includes('src/error-handling') ||
            id.includes('src/telemetry') ||
            id.includes('src/quality')
          ) {
            return 'monitoring'
          }
        }
      }
    },
    // Increase chunk size limit for audio processing and large dependencies
    chunkSizeWarningLimit: 1000,
    // Optimize for production
    target: 'esnext',
    assetsInlineLimit: 4096
  },
  esbuild: {
    // Remove console.log in production builds
    drop: mode === 'production' ? ['console', 'debugger'] : []
  }
}))
