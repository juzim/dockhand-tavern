/**
 * Data processing utilities
 */

import type {
  DockhandContainer,
  DockhandEnvironment,
  DockhandPort,
  ProcessedContainer,
  FilterOptions,
  NpmProxyHost,
} from './types';

/**
 * Extract unique ports from container ports array
 * Deduplicates IPv4/IPv6 entries (ignores IPv6 ::)
 */
export function extractPorts(ports: DockhandPort[]): number[] {
  const uniquePorts = new Set<number>();

  for (const port of ports) {
    // Skip ports without proper host exposure (not published to host)
    if (!port.PublicPort || !port.IP) {
      console.debug(`Skipping port without PublicPort or IP:`, port);
      continue;
    }
    
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
 * Extract network IP address from dhcp-ext network only
 * Returns null if no valid dhcp-ext network IP found
 */
export function extractNetworkIp(networks: Record<string, { ipAddress: string }>): string | null {
  // Only look for dhcp-ext network
  const dhcpExtNetwork = networks['dhcp-ext'];
  
  if (!dhcpExtNetwork) {
    return null;
  }
  
  const ip = dhcpExtNetwork.ipAddress;
  
  // Skip empty or invalid IPs
  if (!ip || ip === '' || ip === '0.0.0.0') {
    return null;
  }
  
  console.debug(`Found dhcp-ext network IP:`, ip);
  return ip;
}

/**
 * Find NPM proxy host that matches container IP:port
 * Returns the proxy host domain URL if found, null otherwise
 */
export function findNpmProxyUrl(
  envIp: string,
  containerPort: number,
  npmProxyHosts: NpmProxyHost[]
): string | null {
  // Find all enabled proxy hosts where forward_host:forward_port matches envIp:containerPort
  const matches = npmProxyHosts.filter(
    host => 
      host.enabled === true &&
      host.forward_host === envIp && 
      host.forward_port === containerPort
  );

  if (matches.length === 0) {
    return null;
  }

  // Use first match
  const match = matches[0];

  // Use first domain name
  const domain = match.domain_names[0];
  if (!domain) {
    return null;
  }

  // Determine protocol based on ssl_forced flag OR certificate_id presence
  // Use HTTPS if ssl_forced is true OR if certificate_id is set (not 0 or null)
  const hasSSL = match.ssl_forced || (match.certificate_id && match.certificate_id !== 0);
  const protocol = hasSSL ? 'https' : 'http';

  return `${protocol}://${domain}`;
}

/**
 * Build access URL for a container
 * Priority: 
 * 1) dockhand-tavern.url label (custom URL)
 * 2) Auto-created NPM domain (from NPM auto-creation)
 * 3) dockhand-tavern.port with networkIP
 * 4) Existing NPM proxy host (manual entry)
 * 5) Default http://IP:port (fallback)
 */
export function buildContainerUrl(
  container: DockhandContainer,
  firstPort: number | null,
  envPublicIp: string,
  networkIp: string | null,
  npmProxyHosts?: NpmProxyHost[],
  autoCreatedDomain?: string
): string {
  // 1. Check for custom URL label (highest priority)
  const customUrl = container.labels?.['dockhand-tavern.url'];
  if (customUrl) {
    console.log(`[DEBUG] Container ${container.name} has custom URL label: "${customUrl}"`);
    return customUrl;
  }

  // 2. Check for auto-created NPM domain (second priority)
  if (autoCreatedDomain) {
    console.log(`[DEBUG] Container ${container.name} using auto-created domain: https://${autoCreatedDomain}`);
    return `https://${autoCreatedDomain}`;
  }

  // 3. Check for custom port label with network IP (third priority)
  const customPort = container.labels?.['dockhand-tavern.port'];
  if (customPort && networkIp) {
    return `http://${networkIp}:${customPort}`;
  }

  // 4. If we have an exposed port, check NPM proxy hosts for match (fourth priority)
  if (firstPort && npmProxyHosts && npmProxyHosts.length > 0) {
    const npmUrl = findNpmProxyUrl(envPublicIp, firstPort, npmProxyHosts);
    if (npmUrl) {
      return npmUrl;
    }
  }

  // 5. Build URL based on what's available (fallback)
  if (firstPort) {
    // Has exposed port: use environment public IP with port
    return `http://${envPublicIp}:${firstPort}`;
  } else if (networkIp) {
    // No exposed port but has network IP: use network IP (default port 80)
    return `http://${networkIp}`;
  }
  
  // Fallback (shouldn't happen if validation is correct)
  return `http://${envPublicIp}`;
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
  environment: DockhandEnvironment,
  npmProxyHosts?: NpmProxyHost[],
  autoCreatedDomain?: string
): ProcessedContainer | null {
  // Debug: Log all dockhand-tavern labels
  const tavernLabels = Object.entries(container.labels || {})
    .filter(([key]) => key.startsWith('dockhand-tavern.'));
  if (tavernLabels.length > 0) {
    console.log(`[DEBUG] Container ${container.name} labels:`, Object.fromEntries(tavernLabels));
  }

  // Check if container is disabled via label
  const isDisabled = container.labels?.['dockhand-tavern.disable'];
  if (isDisabled === 'true' || isDisabled === '1') {
    return null;
  }

  // Only show running containers
  if (container.state !== 'running') {
    return null;
  }

  // Extract ports and network IP
  const ports = extractPorts(container.ports);
  const networkIp = extractNetworkIp(container.networks);

  // Skip containers with no exposed ports AND no network IP
  if (ports.length === 0 && !networkIp) {
    console.debug(`Skipping container ${container.name}: no exposed ports or network IP`);
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

  // Build URL from port or network IP
  const firstPort = ports.length > 0 ? ports[0] : null;
  const url = buildContainerUrl(container, firstPort, environment.publicIp, networkIp, npmProxyHosts, autoCreatedDomain);

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
 * Validate base domain format for NPM auto-creation
 * Returns true if domain is valid (e.g., "example.com", "sub.example.com")
 * Returns false for invalid formats (e.g., "*.example.com", "example.*", "", ".")
 */
export function validateBaseDomain(domain: string): boolean {
  if (!domain || domain.length === 0) {
    return false;
  }

  // Reject domains with wildcards
  if (domain.includes('*')) {
    return false;
  }

  // Reject domains with leading or trailing dots
  if (domain.startsWith('.') || domain.endsWith('.')) {
    return false;
  }

  // Validate domain format: must be valid DNS name
  // Pattern: lowercase letters, numbers, hyphens, and dots
  // Each label (part between dots) must start/end with alphanumeric
  // Must have at least one dot and a valid TLD
  const domainPattern = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
  
  if (!domainPattern.test(domain)) {
    return false;
  }

  // Check total length (max 253 chars for DNS)
  if (domain.length > 253) {
    return false;
  }

  // Check each label length (max 63 chars per label)
  const labels = domain.split('.');
  for (const label of labels) {
    if (label.length > 63) {
      return false;
    }
  }

  return true;
}

/**
 * Validate final generated domain format
 * Returns true if domain is DNS-compatible and contains no invalid characters
 */
export function validateGeneratedDomain(domain: string): boolean {
  if (!domain || domain.length === 0) {
    return false;
  }

  // Check for wildcards or other invalid characters
  if (domain.includes('*') || domain.includes(' ')) {
    return false;
  }

  // Check for leading or trailing dots/hyphens
  if (domain.startsWith('.') || domain.endsWith('.') || 
      domain.startsWith('-') || domain.endsWith('-')) {
    return false;
  }

  // Validate DNS-compatible format
  const domainPattern = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
  
  if (!domainPattern.test(domain)) {
    return false;
  }

  // Check total length
  if (domain.length > 253) {
    return false;
  }

  // Check label lengths
  const labels = domain.split('.');
  for (const label of labels) {
    if (label.length === 0 || label.length > 63) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a domain is covered by a certificate's domain list
 * Supports wildcard certificates (e.g., *.example.com)
 * 
 * Examples:
 * - "app.example.com" matches ["app.example.com"] (exact match)
 * - "app.example.com" matches ["*.example.com"] (wildcard match)
 * - "sub.app.example.com" does NOT match ["*.example.com"] (wildcard only matches one level)
 */
export function isDomainCoveredByCertificate(
  domain: string,
  certDomains: string[]
): boolean {
  const domainLower = domain.toLowerCase();

  for (const certDomain of certDomains) {
    const certDomainLower = certDomain.toLowerCase();

    // Exact match
    if (domainLower === certDomainLower) {
      return true;
    }

    // Wildcard match
    if (certDomainLower.startsWith('*.')) {
      const baseDomain = certDomainLower.substring(2); // Remove "*."
      
      // Check if domain ends with the base domain
      if (domainLower.endsWith('.' + baseDomain)) {
        // Count dots to ensure wildcard only matches one level
        // "app.example.com" has 1 dot before base domain -> matches "*.example.com"
        // "sub.app.example.com" has 2 dots before base domain -> doesn't match "*.example.com"
        const domainWithoutBase = domainLower.substring(0, domainLower.length - baseDomain.length - 1);
        const dotCount = (domainWithoutBase.match(/\./g) || []).length;
        
        if (dotCount === 0) {
          return true; // Only one level before base domain
        }
      }
    }
  }

  return false;
}

/**
 * Extract domain from URL for NPM auto-creation
 * Returns the domain if valid, or null if URL should be skipped
 * 
 * Rejects:
 * - HTTP URLs (only HTTPS supported)
 * - IP addresses (IPv4)
 * - URLs with custom ports (including explicit :443)
 * - Invalid domain formats
 * 
 * Examples:
 * - "https://cloud.ltrg.de" → "cloud.ltrg.de"
 * - "https://cloud.ltrg.de/path" → "cloud.ltrg.de"
 * - "http://cloud.ltrg.de" → null (HTTP)
 * - "https://192.168.1.100" → null (IP)
 * - "https://cloud.ltrg.de:8443" → null (custom port)
 * - "https://cloud.ltrg.de:443" → null (explicit 443)
 */
export function extractDomainFromUrl(url: string): string | null {
  // Must start with https://
  if (!url || !url.startsWith('https://')) {
    return null;
  }

  // Remove protocol
  const withoutProtocol = url.replace('https://', '');
  
  // Extract hostname (before first slash for path)
  const hostname = withoutProtocol.split('/')[0].split('?')[0];
  
  // Reject URLs with ANY port (including :443)
  if (hostname.includes(':')) {
    return null;
  }
  
  // Check if it's an IP address (IPv4)
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Pattern.test(hostname)) {
    return null;
  }
  
  // Validate domain format
  if (!validateGeneratedDomain(hostname)) {
    return null;
  }
  
  return hostname;
}

/**
 * Check if a URL is domain-eligible for NPM auto-creation
 * Returns true if URL starts with https:// AND is not an IP address
 */
export function isDomainEligible(url: string): boolean {
  // Must start with https://
  if (!url.startsWith('https://')) {
    return false;
  }

  // Extract hostname from URL (remove protocol and path)
  const withoutProtocol = url.replace(/^https?:\/\//, '');
  const hostname = withoutProtocol.split('/')[0].split(':')[0];

  // Check if hostname is an IP address (IPv4 or IPv6)
  // IPv4 pattern: xxx.xxx.xxx.xxx
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  // IPv6 pattern (simplified - covers most cases)
  const ipv6Pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;

  if (ipv4Pattern.test(hostname) || ipv6Pattern.test(hostname)) {
    return false; // It's an IP address, skip
  }

  return true; // It's a domain
}

/**
 * Build domain name from service name and base domain
 * Sanitizes service name to be DNS-compatible
 */
export function buildDomainName(serviceName: string, baseDomain: string): string {
  // Sanitize service name: lowercase, replace invalid chars with hyphens
  const sanitized = serviceName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')  // Replace invalid chars with hyphens
    .replace(/^-+|-+$/g, '')      // Remove leading/trailing hyphens
    .replace(/-+/g, '-');         // Collapse multiple hyphens

  return `${sanitized}.${baseDomain}`;
}

/**
 * Find NPM proxy host by domain name
 * Returns the proxy host if domain exists in domain_names array, null otherwise
 */
export function findProxyHostByDomain(
  domain: string,
  npmProxyHosts: NpmProxyHost[]
): NpmProxyHost | null {
  const match = npmProxyHosts.find(host =>
    host.domain_names.includes(domain)
  );

  return match || null;
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
