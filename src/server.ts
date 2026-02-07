/**
 * Dockhand Tavern - Main Server
 * Built with Bun + Elysia
 */

import { Elysia } from 'elysia';
import { DockhandClient } from './dockhand-client';
import { NpmClient } from './npm-client';
import { PeekapingClient } from './peekaping-client';
import { CacheManager } from './cache';
import { renderDashboard } from './template';
import { logger } from './logger';

// Environment variables
const DOCKHAND_URL = process.env.DOCKHAND_URL || 'http://192.168.178.156:3000';
const DOCKHAND_USERNAME = process.env.DOCKHAND_USERNAME || 'admin';
const DOCKHAND_PASSWORD = process.env.DOCKHAND_PASSWORD || '';
const PORT = parseInt(process.env.PORT || '3001', 10);

// NPM environment variables (optional)
const NPM_URL = process.env.NPM_URL;
const NPM_EMAIL = process.env.NPM_EMAIL;
const NPM_PASSWORD = process.env.NPM_PASSWORD;

// NPM auto-creation environment variables (optional)
const NPM_AUTO_CREATE_DOMAIN = process.env.NPM_AUTO_CREATE_DOMAIN;
const NPM_CERTIFICATE_ID = process.env.NPM_CERTIFICATE_ID ? parseInt(process.env.NPM_CERTIFICATE_ID, 10) : undefined;
const NPM_PUBLIC_ACCESS_LIST_ID = process.env.NPM_PUBLIC_ACCESS_LIST_ID ? parseInt(process.env.NPM_PUBLIC_ACCESS_LIST_ID, 10) : undefined;
const NPM_DEFAULT_ACCESS_LIST_ID = process.env.NPM_DEFAULT_ACCESS_LIST_ID ? parseInt(process.env.NPM_DEFAULT_ACCESS_LIST_ID, 10) : undefined;

// Peekaping environment variables (optional)
const PEEKAPING_URL = process.env.PEEKAPING_URL;
const PEEKAPING_API_KEY = process.env.PEEKAPING_API_KEY;

// Peekaping auto-creation environment variables (optional)
const PEEKAPING_NOTIFICATION_IDS = process.env.PEEKAPING_NOTIFICATION_IDS 
  ? JSON.parse(process.env.PEEKAPING_NOTIFICATION_IDS) 
  : [];
const PEEKAPING_DEFAULT_INTERVAL = process.env.PEEKAPING_DEFAULT_INTERVAL 
  ? parseInt(process.env.PEEKAPING_DEFAULT_INTERVAL, 10) 
  : 60;
const PEEKAPING_DEFAULT_TIMEOUT = process.env.PEEKAPING_DEFAULT_TIMEOUT 
  ? parseInt(process.env.PEEKAPING_DEFAULT_TIMEOUT, 10) 
  : 16;
const PEEKAPING_DEFAULT_MAX_RETRIES = process.env.PEEKAPING_DEFAULT_MAX_RETRIES 
  ? parseInt(process.env.PEEKAPING_DEFAULT_MAX_RETRIES, 10) 
  : 3;

// Validate configuration
if (!DOCKHAND_PASSWORD) {
  logger.error('[Server] DOCKHAND_PASSWORD environment variable is required!');
  process.exit(1);
}

logger.info('[Server] Starting Dockhand Tavern');
logger.info(`[Server]   Dockhand URL: ${DOCKHAND_URL}`);
logger.info(`[Server]   Username: ${DOCKHAND_USERNAME}`);
logger.info(`[Server]   Port: ${PORT}`);

// Initialize NPM client if credentials provided
let npmClient: NpmClient | undefined;
if (NPM_URL && NPM_EMAIL && NPM_PASSWORD) {
  logger.info(`[NPM]   URL: ${NPM_URL}`);
  logger.info(`[NPM]   Email: ${NPM_EMAIL}`);
  npmClient = new NpmClient(NPM_URL, NPM_EMAIL, NPM_PASSWORD);
  
  // Test NPM connection
  try {
    const npmConnected = await npmClient.testConnection();
    if (npmConnected) {
      logger.info('[NPM] Connection successful');
      
      // Check if NPM auto-creation is enabled
      if (NPM_AUTO_CREATE_DOMAIN && NPM_CERTIFICATE_ID !== undefined) {
        // Note: Domain validation happens in CacheManager constructor
        // Invalid domains will be rejected there with detailed error messages
        logger.info('[NPM]   Auto-creation enabled');
        logger.info(`[NPM]   Base domain: ${NPM_AUTO_CREATE_DOMAIN}`);
        logger.info(`[NPM]   Certificate ID: ${NPM_CERTIFICATE_ID}`);
        if (NPM_PUBLIC_ACCESS_LIST_ID) {
          logger.info(`[NPM]   Public access list ID: ${NPM_PUBLIC_ACCESS_LIST_ID}`);
        }
        if (NPM_DEFAULT_ACCESS_LIST_ID) {
          logger.info(`[NPM]   Default access list ID: ${NPM_DEFAULT_ACCESS_LIST_ID}`);
        }
        logger.info(`[NPM]   Domain format: {serviceName}.${NPM_AUTO_CREATE_DOMAIN}`);
      } else {
        logger.info('[NPM]   Auto-creation disabled (domain or certificate ID not provided)');
      }
    } else {
      logger.warn('[NPM] Connection failed - will continue without NPM integration');
      npmClient = undefined;
    }
  } catch (error) {
    logger.warn('[NPM] Connection test failed:', error);
    npmClient = undefined;
  }
} else {
  logger.info('[NPM] Integration disabled (credentials not provided)');
}

// Initialize Peekaping client if credentials provided
let peekapingClient: PeekapingClient | undefined;
if (PEEKAPING_URL && PEEKAPING_API_KEY) {
  logger.info(`[Peekaping]   URL: ${PEEKAPING_URL}`);
  peekapingClient = new PeekapingClient(PEEKAPING_URL, PEEKAPING_API_KEY);
  
  // Test Peekaping connection
  try {
    const peekapingConnected = await peekapingClient.testConnection();
    if (peekapingConnected) {
      logger.info('[Peekaping] Connection successful');
      
      if (PEEKAPING_NOTIFICATION_IDS.length > 0) {
        logger.info(`[Peekaping]   Notification IDs: ${PEEKAPING_NOTIFICATION_IDS.join(', ')}`);
      } else {
        logger.info('[Peekaping]   Notification IDs: none (monitors will have no notifications)');
      }
      logger.info(`[Peekaping]   Monitoring: ${PEEKAPING_DEFAULT_INTERVAL}s interval, ${PEEKAPING_DEFAULT_TIMEOUT}s timeout, ${PEEKAPING_DEFAULT_MAX_RETRIES} retries`);
    } else {
      logger.warn('[Peekaping] Connection failed - will continue without Peekaping integration');
      peekapingClient = undefined;
    }
  } catch (error) {
    logger.warn('[Peekaping] Connection test failed:', error);
    peekapingClient = undefined;
  }
} else {
  logger.info('[Peekaping] Integration disabled (credentials not provided)');
}

// Initialize Dockhand client and cache
const client = new DockhandClient(DOCKHAND_URL, DOCKHAND_USERNAME, DOCKHAND_PASSWORD);
const cache = new CacheManager(
  npmClient,
  NPM_AUTO_CREATE_DOMAIN,
  NPM_CERTIFICATE_ID,
  NPM_PUBLIC_ACCESS_LIST_ID,
  NPM_DEFAULT_ACCESS_LIST_ID,
  peekapingClient,
  PEEKAPING_NOTIFICATION_IDS,
  PEEKAPING_DEFAULT_INTERVAL,
  PEEKAPING_DEFAULT_TIMEOUT,
  PEEKAPING_DEFAULT_MAX_RETRIES
);

// Initial cache population
logger.info('[Cache] Populating initial cache...');
await cache.refreshImmediate(client);
const stats = cache.getStats();
logger.info(`[Cache] Initial cache populated (${stats.totalContainers} containers, ${stats.totalEnvironments} environments)`);

// Create Elysia app
const app = new Elysia()
  // Serve static files
  .get('/style.css', () => Bun.file('public/style.css'))
  .get('/app.js', () => Bun.file('public/app.js'))

  // Main dashboard endpoint
  .get('/', ({ query }) => {
    const filters = {
      search: query.search as string | undefined,
      stack: query.stack as string | undefined,
      env: query.env as string | undefined,
    };

    const html = renderDashboard(cache.get(), filters, DOCKHAND_URL);

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  })

  // Webhook endpoint (non-blocking) - accepts both GET and POST
  .post('/webhook', async ({ body }) => {
    logger.info('[Webhook] Received POST request');
    logger.debug('[Webhook]   Body:', body);

    // Trigger debounced cache refresh (non-blocking)
    cache.refresh(client).catch((error) => {
      logger.error('[Webhook] Cache refresh failed:', error);
    });

    // Respond immediately
    return { status: 'ok', message: 'Webhook received, refresh queued' };
  })

  .get('/webhook', async () => {
    logger.info('[Webhook] Received GET request');

    // Trigger debounced cache refresh (non-blocking)
    cache.refresh(client).catch((error) => {
      logger.error('[Webhook] Cache refresh failed:', error);
    });

    // Respond immediately
    return { status: 'ok', message: 'Webhook received, refresh queued' };
  })

  // Health check endpoint
  .get('/health', () => {
    const stats = cache.getStats();

    return {
      status: 'healthy',
      uptime: process.uptime(),
      cache: stats,
      timestamp: new Date().toISOString(),
    };
  })

  // API endpoint to get current cache data (for debugging)
  .get('/api/cache', () => {
    return cache.get();
  })

  // 404 handler
  .onError(({ code, error }) => {
    if (code === 'NOT_FOUND') {
      return new Response('404 - Page not found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    logger.error('[Server] Server error:', error);
    return new Response('500 - Internal Server Error', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  })

  // Start server
  .listen(PORT);

logger.info(`[Server] Dockhand Tavern is running at http://localhost:${PORT}`);
logger.info(`[Server]   Dashboard: http://localhost:${PORT}`);
logger.info(`[Server]   Health: http://localhost:${PORT}/health`);
logger.info(`[Server]   Webhook: http://localhost:${PORT}/webhook (GET or POST)`);
