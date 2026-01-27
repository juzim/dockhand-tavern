/**
 * Dockhand Tavern - Main Server
 * Built with Bun + Elysia
 */

import { Elysia } from 'elysia';
import { DockhandClient } from './dockhand-client';
import { CacheManager } from './cache';
import { renderDashboard } from './template';

// Environment variables
const DOCKHAND_URL = process.env.DOCKHAND_URL || 'http://192.168.178.156:3000';
const DOCKHAND_USERNAME = process.env.DOCKHAND_USERNAME || 'admin';
const DOCKHAND_PASSWORD = process.env.DOCKHAND_PASSWORD || '';
const PORT = parseInt(process.env.PORT || '3001', 10);

// Validate configuration
if (!DOCKHAND_PASSWORD) {
  console.error('❌ DOCKHAND_PASSWORD environment variable is required!');
  process.exit(1);
}

console.log('🍺 Starting Dockhand Tavern...');
console.log(`   Dockhand URL: ${DOCKHAND_URL}`);
console.log(`   Username: ${DOCKHAND_USERNAME}`);
console.log(`   Port: ${PORT}`);

// Initialize Dockhand client and cache
const client = new DockhandClient(DOCKHAND_URL, DOCKHAND_USERNAME, DOCKHAND_PASSWORD);
const cache = new CacheManager();

// Initial cache population
console.log('📦 Populating initial cache...');
await cache.refresh(client);
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

    const html = renderDashboard(cache.get(), filters);

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  })

  // Webhook endpoint (non-blocking)
  .post('/webhook', async ({ body }) => {
    console.log('📨 Webhook received:', body);

    // Respond immediately
    const response = { status: 'ok', message: 'Webhook received' };

    // Trigger background cache refresh (non-blocking)
    setTimeout(async () => {
      try {
        console.log('🔄 Refreshing cache in background...');
        await cache.refresh(client);
        console.log('✅ Cache refresh completed via webhook');
      } catch (error) {
        console.error('❌ Webhook cache refresh failed:', error);
      }
    }, 0);

    return response;
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
console.log(`   Webhook: http://localhost:${PORT}/webhook (POST)`);
console.log(`\n📊 Cache stats:`, cache.getStats());
console.log(`\n💡 Tip: Set this as your browser's new tab page!`);
console.log(`\n🔄 The dashboard will auto-update via webhooks from Dockhand.`);
console.log(`   Configure webhook in Dockhand: POST http://<this-server>:${PORT}/webhook\n`);
