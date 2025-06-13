import {defineConfig} from 'vite';
import path from 'path';

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      external: ['@smithy/node-http-handler', 'https', '@google/genai'],
    },
  },
});
