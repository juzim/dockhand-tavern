/**
 * Cache Manager
 * Manages in-memory cache of container data
 */

import { DockhandClient } from './dockhand-client';
import { processContainer, parseBookmarks } from './utils';
import type { CacheData, ProcessedContainer } from './types';

export class CacheManager {
  private data: CacheData = {
    environments: [],
    containers: [],
    lastUpdate: new Date(),
    error: undefined,
  };
  private bookmarks: ProcessedContainer[];

  constructor() {
    // Parse bookmarks once on initialization
    this.bookmarks = parseBookmarks();
  }

  /**
   * Refresh cache from Dockhand API
   */
  async refresh(client: DockhandClient): Promise<void> {
    try {
      console.log('Refreshing cache from Dockhand...');

      // 1. Fetch environments
      const environments = await client.fetchEnvironments();

      // 2. Fetch containers for each environment
      const allContainers: ProcessedContainer[] = [];

      for (const env of environments) {
        try {
          const rawContainers = await client.fetchContainers(env.id);

          for (const container of rawContainers) {
            const processed = processContainer(container, env);
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
