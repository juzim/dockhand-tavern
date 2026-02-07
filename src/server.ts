/**
 * Dockhand Tavern - Main Server
 * Built with Bun + Elysia
 */

import { Elysia } from 'elysia';
import { DockhandClient } from './dockhand-client';
import { NpmClient } from './npm-client';
import { CacheManager } from './cache';
import { renderDashboard } from './template';

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

// Validate configuration
if (!DOCKHAND_PASSWORD) {
  console.error('❌ DOCKHAND_PASSWORD environment variable is required!');
  process.exit(1);
}

console.log('🍺 Starting Dockhand Tavern...');
console.log(`   Dockhand URL: ${DOCKHAND_URL}`);
console.log(`   Username: ${DOCKHAND_USERNAME}`);
console.log(`   Port: ${PORT}`);

// Initialize NPM client if credentials provided
let npmClient: NpmClient | undefined;
if (NPM_URL && NPM_EMAIL && NPM_PASSWORD) {
  console.log(`   NPM URL: ${NPM_URL}`);
  console.log(`   NPM Email: ${NPM_EMAIL}`);
  npmClient = new NpmClient(NPM_URL, NPM_EMAIL, NPM_PASSWORD);
  
  // Test NPM connection
  try {
    const npmConnected = await npmClient.testConnection();
    if (npmConnected) {
      console.log('✅ NPM connection successful');
      
      // Check if NPM auto-creation is enabled
      if (NPM_AUTO_CREATE_DOMAIN && NPM_CERTIFICATE_ID !== undefined) {
        // Note: Domain validation happens in CacheManager constructor
        // Invalid domains will be rejected there with detailed error messages
        console.log(`   NPM auto-creation: configured`);
        console.log(`   Base domain: ${NPM_AUTO_CREATE_DOMAIN}`);
        console.log(`   Certificate ID: ${NPM_CERTIFICATE_ID}`);
        if (NPM_PUBLIC_ACCESS_LIST_ID) {
          console.log(`   Public access list ID: ${NPM_PUBLIC_ACCESS_LIST_ID}`);
        }
        if (NPM_DEFAULT_ACCESS_LIST_ID) {
          console.log(`   Default access list ID: ${NPM_DEFAULT_ACCESS_LIST_ID}`);
        }
        console.log(`   Domains will be created as: {serviceName}.${NPM_AUTO_CREATE_DOMAIN}`);
      } else {
        console.log('   NPM auto-creation: disabled (domain or certificate ID not provided)');
      }
    } else {
      console.warn('⚠️  NPM connection failed - will continue without NPM integration');
      npmClient = undefined;
    }
  } catch (error) {
    console.warn('⚠️  NPM connection test failed:', error);
    npmClient = undefined;
  }
} else {
  console.log('   NPM integration: disabled (credentials not provided)');
}

// Initialize Dockhand client and cache
const client = new DockhandClient(DOCKHAND_URL, DOCKHAND_USERNAME, DOCKHAND_PASSWORD);
const cache = new CacheManager(
  npmClient,
  NPM_AUTO_CREATE_DOMAIN,
  NPM_CERTIFICATE_ID,
  NPM_PUBLIC_ACCESS_LIST_ID,
  NPM_DEFAULT_ACCESS_LIST_ID
);

// Initial cache population
console.log('📦 Populating initial cache...');
await cache.refreshImmediate(client);
console.log('✅ Initial cache populated');

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
    console.log('📨 Webhook received (POST):', body);

    // Trigger debounced cache refresh (non-blocking)
    cache.refresh(client).catch((error) => {
      console.error('❌ Webhook cache refresh failed:', error);
    });

    // Respond immediately
    return { status: 'ok', message: 'Webhook received, refresh queued' };
  })

  .get('/webhook', async () => {
    console.log('📨 Webhook received (GET)');

    // Trigger debounced cache refresh (non-blocking)
    cache.refresh(client).catch((error) => {
      console.error('❌ Webhook cache refresh failed:', error);
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

    console.error('Server error:', error);
    return new Response('500 - Internal Server Error', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  })

  // Start server
  .listen(PORT);

console.log(`\n✅ Dockhand Tavern is running!`);
console.log(`   Dashboard: http://localhost:${PORT}`);
console.log(`   Health: http://localhost:${PORT}/health`);
console.log(`   Webhook: http://localhost:${PORT}/webhook (GET or POST)`);
console.log(`\n📊 Cache stats:`, cache.getStats());
console.log(`\n💡 Tip: Set this as your browser's new tab page!`);
console.log(`\n🔄 The dashboard will auto-update via webhooks from Dockhand.`);
console.log(`   Configure webhook in Dockhand: http://<this-server>:${PORT}/webhook\n`);
