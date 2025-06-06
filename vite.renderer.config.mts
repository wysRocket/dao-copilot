import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {defineConfig} from 'vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
  ],
  optimizeDeps: {
    include: ['@google-cloud/speech', '@google/genai'],
  },
  define: {},
  resolve: {
    preserveSymlinks: true,
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        titlebar: path.resolve(__dirname, 'titlebar.html'),
        transcript: path.resolve(__dirname, 'transcript.html'),
        'ai-assistant': path.resolve(__dirname, 'ai-assistant.html'),
      },
    },
  },
});
