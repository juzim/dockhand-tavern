/**
 * Data processing utilities
 */

import type {
  DockhandContainer,
  DockhandEnvironment,
  DockhandPort,
  ProcessedContainer,
  FilterOptions,
} from './types';

/**
 * Extract unique ports from container ports array
 * Deduplicates IPv4/IPv6 entries (ignores IPv6 ::)
 */
export function extractPorts(ports: DockhandPort[]): number[] {
  const uniquePorts = new Set<number>();

  for (const port of ports) {
    // Skip IPv6 entries (we only need one entry per port)
    if (port.IP === '::') continue;
    
    // Skip internal/localhost ports
    if (port.IP === '' || port.IP === '127.0.0.1') continue;
    
    // Only include TCP ports (skip UDP)
    if (port.Type !== 'tcp') continue;

    uniquePorts.add(port.PublicPort);
  }

  return Array.from(uniquePorts).sort((a, b) => a - b);
}

/**
 * Build access URL for a container
 * Uses dockhand-tavern.url label if available, otherwise constructs URL from first port
 */
export function buildContainerUrl(
  container: DockhandContainer,
  firstPort: number,
  envPublicIp: string
): string {
  // Check for custom URL
  const customUrl = container.labels?.['dockhand-tavern.url'];

  if (customUrl) {
    return customUrl;
  }

  // Default: construct HTTP URL from first port
  return `http://${envPublicIp}:${firstPort}`;
}

/**
 * Resolve icon URL from selfh.st CDN
 * Priority: dockhand-tavern.icon label > fallback name > generic fallback
 * Uses base icons (no theme suffix) for maximum compatibility
 */
export function resolveIconUrl(
  iconLabel: string | undefined,
  fallbackName: string
): string {
  let iconName: string;

  if (iconLabel) {
    // If icon is a full URL, use it directly
    if (iconLabel.startsWith('http://') || iconLabel.startsWith('https://')) {
      return iconLabel;
    }
    
    // Use icon label (strip .png extension if present)
    iconName = iconLabel.replace(/\.png$/i, '');
  } else {
    // Fall back to display name
    iconName = fallbackName === 'ungrouped' ? 'docker' : fallbackName;
  }

  // Sanitize icon name: lowercase, replace spaces/underscores with hyphens
  const sanitized = iconName
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  // Use base icon name (no theme suffix by default)
  const finalIconName = sanitized;

  // Build CDN URL
  return `https://cdn.jsdelivr.net/gh/selfhst/icons/png/${finalIconName}.png`;
}

/**
 * Process raw container into display format
 */
export function processContainer(
  container: DockhandContainer,
  environment: DockhandEnvironment
): ProcessedContainer | null {
  // Only show running containers
  if (container.state !== 'running') {
    return null;
  }

  // Extract ports
  const ports = extractPorts(container.ports);

  // Skip containers with no exposed ports
  if (ports.length === 0) {
    return null;
  }

  // Extract group name - ONLY from dockhand-tavern.group label
  const group = container.labels?.['dockhand-tavern.group'] || 'ungrouped';

  // Extract metadata from dockhand-tavern labels
  // Priority: custom name > compose service name > container name
  const displayName = 
    container.labels?.['dockhand-tavern.name'] || 
    container.labels?.['com.docker.compose.service'] || 
    container.name;
  const icon = container.labels?.['dockhand-tavern.icon'];

  // Build single URL from first port
  const url = buildContainerUrl(container, ports[0], environment.publicIp);

  // Resolve icon URL
  const iconUrl = resolveIconUrl(icon, displayName);

  return {
    id: container.id,
    displayName,
    group,
    environment: {
      id: environment.id,
      name: environment.name,
      publicIp: environment.publicIp,
    },
    url,
    icon,
    iconUrl,
    image: container.image,
  };
}

/**
 * Filter containers based on filter options
 */
export function filterContainers(
  containers: ProcessedContainer[],
  filters: FilterOptions
): ProcessedContainer[] {
  let filtered = containers;

  // Filter by search (display name)
  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    filtered = filtered.filter(
      (c) => c.displayName.toLowerCase().includes(searchLower)
    );
  }

  // Filter by stack
  if (filters.stack) {
    filtered = filtered.filter((c) => c.stack === filters.stack);
  }

  // Filter by environment
  if (filters.env) {
    filtered = filtered.filter((c) => c.environment.name === filters.env);
  }

  return filtered;
}

/**
 * Get unique group names from containers
 */
export function getUniqueGroups(containers: ProcessedContainer[]): string[] {
  const groups = new Set<string>();
  containers.forEach((c) => groups.add(c.group));
  return Array.from(groups).sort((a, b) => {
    // Sort alphabetically, but "ungrouped" always last
    if (a === 'ungrouped') return 1;
    if (b === 'ungrouped') return -1;
    return a.localeCompare(b);
  });
}

/**
 * Get unique environment names from containers
 */
export function getUniqueEnvironments(
  containers: ProcessedContainer[]
): string[] {
  const envs = new Set<string>();
  containers.forEach((c) => envs.add(c.environment.name));
  return Array.from(envs).sort();
}



/**
 * Parse BOOKMARKS environment variable into ProcessedContainer objects
 * Expected format: [{"name":"Foo","url":"https://example.com","icon":"optional","group":"optional"}]
 */
export function parseBookmarks(): ProcessedContainer[] {
  const bookmarksEnv = process.env.BOOKMARKS;
  
  if (!bookmarksEnv) {
    return [];
  }
  
  try {
    const bookmarksArray = JSON.parse(bookmarksEnv);
    
    if (!Array.isArray(bookmarksArray)) {
      console.warn('⚠️  BOOKMARKS must be a JSON array');
      return [];
    }
    
    const processed: ProcessedContainer[] = [];
    
    for (const bookmark of bookmarksArray) {
      if (!bookmark.name || !bookmark.url) {
        console.warn('⚠️  Skipping invalid bookmark (missing name or url):', bookmark);
        continue;
      }
      
      try {
        const processedBookmark = processBookmark(bookmark);
        processed.push(processedBookmark);
      } catch (error) {
        console.warn('⚠️  Failed to process bookmark:', bookmark, error);
      }
    }
    
    if (processed.length > 0) {
      console.log(`✅ Loaded ${processed.length} bookmark(s)`);
    }
    
    return processed;
    
  } catch (error) {
    console.error('❌ Failed to parse BOOKMARKS environment variable:', error);
    return [];
  }
}

/**
 * Convert a bookmark entry into a ProcessedContainer
 */
export function processBookmark(entry: { 
  name: string; 
  url: string; 
  icon?: string;
  group?: string;
}): ProcessedContainer {
  // Generate a stable ID from the bookmark data
  const id = `bookmark-${entry.name}-${entry.url}`;
  
  return {
    id,
    displayName: entry.name,
    group: entry.group || 'ungrouped',  // Use group or default to ungrouped
    environment: {
      id: -1,
      name: 'bookmark',          // Shows as "bookmark" ribbon
      publicIp: '',              // Not applicable
    },
    url: entry.url,              // Direct URL from user
    icon: entry.icon,
    iconUrl: resolveIconUrl(entry.icon, entry.name), // Use name for icon fallback
    image: '',                   // Not applicable
  };
}
