import {defineConfig} from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: ['@smithy/node-http-handler', 'https', '@google/genai'],
    },
  },
});
