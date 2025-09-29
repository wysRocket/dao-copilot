import path from 'path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import {defineConfig} from 'vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']]
      }
    })
  ],
  optimizeDeps: {
    include: ['@google-cloud/speech', '@google/genai', 'liquid-glass-react']
  },
  define: {},
  resolve: {
    preserveSymlinks: true,
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  build: {
    rollupOptions: {
      external: [
        'events',
        'src/services/gemini-message-handler',
        'src/services/gemini-live-websocket',
        'src/services/gemini-reconnection-manager',
        'src/services/gemini-logger',
        'src/services/gemini-live-integration'
      ]
    }
  }
})
