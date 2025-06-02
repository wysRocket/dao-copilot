import express from 'express';
import cors from 'cors';
import {createProxyMiddleware} from 'http-proxy-middleware';
import {Server} from 'http';

let server: Server | null = null;

export async function createProxyServer(): Promise<void> {
  if (server) {
    console.log('Proxy server already running');
    return;
  }

  const app = express();

  // Enable CORS for all routes
  app.use(
    cors({
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-goog-api-key'],
    }),
  );

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({status: 'ok', timestamp: new Date().toISOString()});
  });

  // Proxy for Google Generative AI API
  app.use(
    '/google-ai',
    createProxyMiddleware({
      target: 'https://generativelanguage.googleapis.com',
      changeOrigin: true,
      pathRewrite: {
        '^/google-ai': '',
      },
    }),
  );

  // Additional proxy for Gemini API (alternative endpoint)
  app.use(
    '/gemini',
    createProxyMiddleware({
      target: 'https://generativelanguage.googleapis.com',
      changeOrigin: true,
      pathRewrite: {
        '^/gemini': '/v1beta',
      },
    }),
  );

  const PORT = 8001;

  return new Promise((resolve, reject) => {
    server = app
      .listen(PORT, () => {
        console.log(`Proxy server running on http://localhost:${PORT}`);
        resolve();
      })
      .on('error', reject);
  });
}

export function stopProxyServer(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => {
        console.log('Proxy server stopped');
        server = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}
