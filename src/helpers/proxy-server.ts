import express from 'express';
import cors from 'cors';
import {createProxyMiddleware} from 'http-proxy-middleware';
import {Server} from 'http';

/**
 * Secure Proxy Server for Google Gemini API
 *
 * Security Features:
 * - CORS restricted to specific origins (Electron app only)
 * - Authentication token required for all API endpoints
 * - Request logging for security monitoring
 * - Minimal exposed methods (GET, POST, OPTIONS only)
 *
 * This proxy serves as a fallback mechanism when direct API calls fail.
 * Primary transcription happens in main process without CORS issues.
 */

let server: Server | null = null;

// Generate a simple token for proxy authentication
const PROXY_AUTH_TOKEN = `electron-proxy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Middleware for basic authentication and logging
function authMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const authHeader = req.headers['x-proxy-auth'] as string;
  const userAgent = req.headers['user-agent'] || 'unknown';

  // Log all proxy requests for security monitoring
  console.log(
    `[PROXY] ${req.method} ${req.path} from ${req.ip} - UA: ${userAgent}`,
  );

  // For health check, no auth required
  if (req.path === '/health') {
    return next();
  }

  // Check authentication token
  if (authHeader !== PROXY_AUTH_TOKEN) {
    console.warn(
      `[PROXY] Unauthorized request from ${req.ip} - invalid/missing auth token`,
    );
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Valid proxy authentication token required',
    });
  }

  next();
}

export async function createProxyServer(): Promise<void> {
  if (server) {
    console.log('Proxy server already running');
    return;
  }

  const app = express();

  // Add authentication middleware before CORS
  app.use(authMiddleware);

  // Enable CORS with restricted origins for better security
  // Only allow requests from the Electron app's renderer process
  app.use(
    cors({
      origin: [
        'http://localhost:5173', // Vite dev server
        'http://localhost:5174', // Alternative Vite port
        'http://localhost:4173', // Vite preview
        'file://', // Electron file protocol (production builds)
        'capacitor://localhost', // In case of Capacitor integration
        'http://localhost:8080', // Common dev server port
      ],
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'x-goog-api-key',
        'x-proxy-auth', // Custom auth header for additional security
      ],
      credentials: true, // Allow credentials for more secure communication
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
        console.log(`[PROXY] Proxy server running on http://localhost:${PORT}`);
        console.log(
          `[PROXY] Auth token: ${PROXY_AUTH_TOKEN.substring(0, 20)}...`,
        );
        console.log(
          `[PROXY] Allowed origins: http://localhost:5173, file://, etc.`,
        );
        console.log(
          `[PROXY] Security: CORS restricted, authentication enabled`,
        );
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

/**
 * Get the current proxy authentication token
 * This should be included in requests as the 'x-proxy-auth' header
 */
export function getProxyAuthToken(): string {
  return PROXY_AUTH_TOKEN;
}
