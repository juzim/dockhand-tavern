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
 * Build access URL for a container port
 * Uses dockhand-tavern.href or homepage.href if available, otherwise constructs URL
 */
export function buildPortUrl(
  container: DockhandContainer,
  port: number,
  envPublicIp: string
): string {
  // Check for custom URL (dockhand-tavern.href takes priority)
  const customHref = container.labels?.['dockhand-tavern.href'] || 
                     container.labels?.['homepage.href'];

  if (customHref) {
    // Use custom href if it matches this port
    try {
      const url = new URL(customHref);
      const urlPort = parseInt(
        url.port || (url.protocol === 'https:' ? '443' : '80')
      );

      if (urlPort === port) {
        return customHref;
      }
    } catch (e) {
      // Invalid URL, fall through to default
    }
  }

  // Default: construct HTTP URL
  return `http://${envPublicIp}:${port}`;
}

/**
 * Resolve icon URL from selfh.st CDN
 * Priority: homepage.icon label > stack name > generic fallback
 * Uses base icons (no theme suffix) for maximum compatibility
 */
export function resolveIconUrl(
  homepageIcon: string | undefined,
  stackName: string
): string {
  let iconName: string;

  if (homepageIcon) {
    // If homepage.icon is a full URL, use it directly
    if (homepageIcon.startsWith('http://') || homepageIcon.startsWith('https://')) {
      return homepageIcon;
    }
    
    // Use homepage.icon label (strip .png extension if present)
    iconName = homepageIcon.replace(/\.png$/i, '');
  } else {
    // Fall back to stack name
    iconName = stackName === 'standalone' ? 'docker' : stackName;
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

  // Extract stack name from compose labels
  const stack =
    container.labels?.['com.docker.compose.project'] || 'standalone';

  // Extract homepage metadata
  const displayName = container.labels?.['dockhand-tavern.name'] || 
                      container.labels?.['homepage.name'] || 
                      container.name;
  const customUrl = container.labels?.['dockhand-tavern.href'] || 
                    container.labels?.['homepage.href'];
  const icon = container.labels?.['homepage.icon'];

  // Build port URLs
  const portUrls = ports.map((port) => ({
    port,
    url: buildPortUrl(container, port, environment.publicIp),
  }));

  // Resolve icon URL
  const iconUrl = resolveIconUrl(icon, stack);

  return {
    id: container.id,
    name: container.name,
    displayName,
    stack,
    environment: {
      id: environment.id,
      name: environment.name,
      publicIp: environment.publicIp,
    },
    ports: portUrls,
    customUrl,
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

  // Filter by search (container name or display name)
  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    filtered = filtered.filter(
      (c) =>
        c.name.toLowerCase().includes(searchLower) ||
        c.displayName.toLowerCase().includes(searchLower)
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
 * Get unique stack names from containers
 */
export function getUniqueStacks(containers: ProcessedContainer[]): string[] {
  const stacks = new Set<string>();
  containers.forEach((c) => stacks.add(c.stack));
  return Array.from(stacks).sort();
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
 * Get unique stacks filtered by environment selection
 */
export function getFilteredStacks(
  containers: ProcessedContainer[],
  selectedEnv?: string
): string[] {
  const stacks = new Set<string>();
  
  containers.forEach((c) => {
    // Only include stacks from the selected environment (or all if none selected)
    if (!selectedEnv || c.environment.name === selectedEnv) {
      stacks.add(c.stack);
    }
  });
  
  return Array.from(stacks).sort();
}
