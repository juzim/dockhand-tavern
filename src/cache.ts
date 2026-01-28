/**
 * Cache Manager
 * Manages in-memory cache of container data
 */

import { DockhandClient } from './dockhand-client';
import { NpmClient } from './npm-client';
import { processContainer, parseBookmarks } from './utils';
import type { CacheData, ProcessedContainer, NpmProxyHost } from './types';

export class CacheManager {
  private data: CacheData = {
    environments: [],
    containers: [],
    lastUpdate: new Date(),
    error: undefined,
  };
  private bookmarks: ProcessedContainer[];
  private npmClient: NpmClient | null = null;
  private isRefreshing: boolean = false;
  private debounceTimer: Timer | null = null;
  private pendingRefreshCount: number = 0;

  constructor(npmClient?: NpmClient) {
    // Parse bookmarks once on initialization
    this.bookmarks = parseBookmarks();
    this.npmClient = npmClient || null;
  }

  /**
   * Refresh cache from Dockhand API (and optionally NPM)
   * This is the actual refresh logic (called by refreshDebounced)
   */
  private async doRefresh(client: DockhandClient): Promise<void> {
    try {
      console.log('Refreshing cache from Dockhand...');

      // 1. Fetch NPM proxy hosts (if NPM client available)
      let npmProxyHosts: NpmProxyHost[] = [];
      if (this.npmClient) {
        try {
          console.log('Fetching NPM proxy hosts...');
          npmProxyHosts = await this.npmClient.fetchProxyHosts();
          console.log(`✅ Fetched ${npmProxyHosts.length} NPM proxy host(s)`);
        } catch (error) {
          console.error('⚠️  Failed to fetch NPM proxy hosts:', error);
          // Continue without NPM data (fail silently)
        }
      }

      // 2. Fetch environments
      const environments = await client.fetchEnvironments();

      // 3. Fetch containers for each environment
      const allContainers: ProcessedContainer[] = [];

      for (const env of environments) {
        try {
          const rawContainers = await client.fetchContainers(env.id);

          for (const container of rawContainers) {
            // Pass NPM proxy hosts to processContainer
            const processed = processContainer(container, env, npmProxyHosts);
            if (processed) {
              allContainers.push(processed);
            }
          }
        } catch (error) {
          console.error(`Failed to fetch containers for env ${env.name}:`, error);
          // Continue with other environments
        }
      }

      // Update cache atomically
      this.data = {
        environments,
        containers: allContainers,
        lastUpdate: new Date(),
        error: undefined,
      };

      console.log(
        `Cache refreshed: ${allContainers.length} containers from ${environments.length} environments`
      );
    } catch (error) {
      console.error('Cache refresh failed:', error);

      // Update error but keep old data
      this.data.error = error instanceof Error ? error.message : 'Unknown error';
      this.data.lastUpdate = new Date();
    }
  }

  /**
   * Refresh cache with debouncing and locking
   * If multiple refresh requests come in within 5 seconds, only the last one will be executed
   */
  async refresh(client: DockhandClient): Promise<void> {
    this.pendingRefreshCount++;
    
    // Clear existing debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    console.log(`📨 Refresh request received (${this.pendingRefreshCount} pending)`);

    // Set new debounce timer (5 seconds)
    this.debounceTimer = setTimeout(async () => {
      // Check if already refreshing
      if (this.isRefreshing) {
        console.log('⏳ Cache refresh already in progress, skipping...');
        this.pendingRefreshCount = 0;
        return;
      }

      const requestCount = this.pendingRefreshCount;
      this.pendingRefreshCount = 0;

      console.log(`🔄 Starting cache refresh (processed ${requestCount} queued request(s))`);

      // Set lock
      this.isRefreshing = true;

      try {
        await this.doRefresh(client);
      } finally {
        // Release lock
        this.isRefreshing = false;
      }
    }, 5000);
  }

  /**
   * Refresh cache immediately without debouncing (for initial population)
   */
  async refreshImmediate(client: DockhandClient): Promise<void> {
    if (this.isRefreshing) {
      console.log('⏳ Cache refresh already in progress, skipping immediate refresh...');
      return;
    }

    this.isRefreshing = true;
    try {
      await this.doRefresh(client);
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Get current cache data (merged with bookmarks)
   */
  get(): CacheData {
    return {
      ...this.data,
      containers: [...this.data.containers, ...this.bookmarks],
    };
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      totalContainers: this.data.containers.length,
      totalBookmarks: this.bookmarks.length,
      totalEnvironments: this.data.environments.length,
      lastUpdate: this.data.lastUpdate,
      hasError: !!this.data.error,
    };
  }
}
