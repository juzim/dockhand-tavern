/**
 * Cache Manager
 * Manages in-memory cache of container data
 */

import { DockhandClient } from './dockhand-client';
import { NpmClient } from './npm-client';
import { PeekapingClient } from './peekaping-client';
import { processContainer, parseBookmarks, buildDomainName, findProxyHostByDomain, validateBaseDomain, validateGeneratedDomain, isDomainCoveredByCertificate, extractDomainFromUrl, findNpmProxyHostForContainer, generateTagColor } from './utils';
import { extractPorts } from './utils';
import type { CacheData, ProcessedContainer, NpmProxyHost, DockhandContainer, DockhandEnvironment, PeekapingMonitor, PeekapingCreateMonitorRequest, PeekapingTag } from './types';
import type { NpmCreateProxyHostRequest, NpmCertificate } from './npm-types';

export class CacheManager {
  private data: CacheData = {
    environments: [],
    containers: [],
    lastUpdate: new Date(),
    error: undefined,
  };
  private bookmarks: ProcessedContainer[];
  private npmClient: NpmClient | null = null;
  private peekapingClient: PeekapingClient | null = null;
  private isRefreshing: boolean = false;
  private debounceTimer: Timer | null = null;
  private pendingRefreshCount: number = 0;
  
  // NPM auto-creation configuration
  private npmAutoCreateDomain: string | null = null;
  private npmCertificateId: number | null = null;
  private npmPublicAccessListId: number | null = null;
  private npmDefaultAccessListId: number | null = null;
  private npmCertificateDomains: string[] = []; // Cached certificate domains
  private autoCreatedDomains: Map<string, string> = new Map(); // containerId → domain mapping
  
  // Peekaping auto-creation configuration
  private peekapingNotificationIds: string[] = [];
  private peekapingDefaultInterval: number = 60;
  private peekapingDefaultTimeout: number = 16;
  private peekapingDefaultMaxRetries: number = 3;
  private autoCreatedMonitors: Map<string, string> = new Map(); // containerId → monitorId mapping
  
  // Peekaping tag management
  private tagCache: Map<string, PeekapingTag> = new Map(); // tagName → tag object
  private readonly DOCKHAND_TAG = 'dockhand-tavern';
  private readonly DOCKHAND_TAG_COLOR = '#3b82f6';

  constructor(
    npmClient?: NpmClient,
    npmAutoCreateDomain?: string,
    npmCertificateId?: number,
    npmPublicAccessListId?: number,
    npmDefaultAccessListId?: number,
    peekapingClient?: PeekapingClient,
    peekapingNotificationIds?: string[],
    peekapingDefaultInterval?: number,
    peekapingDefaultTimeout?: number,
    peekapingDefaultMaxRetries?: number
  ) {
    // Parse bookmarks once on initialization
    this.bookmarks = parseBookmarks();
    this.npmClient = npmClient || null;
    this.npmPublicAccessListId = npmPublicAccessListId || null;
    this.npmDefaultAccessListId = npmDefaultAccessListId || null;
    
    // Initialize Peekaping client
    this.peekapingClient = peekapingClient || null;
    this.peekapingNotificationIds = peekapingNotificationIds || [];
    this.peekapingDefaultInterval = peekapingDefaultInterval || 60;
    this.peekapingDefaultTimeout = peekapingDefaultTimeout || 16;
    this.peekapingDefaultMaxRetries = peekapingDefaultMaxRetries || 3;

    // Validate NPM auto-creation configuration
    if (npmAutoCreateDomain && npmCertificateId !== undefined && npmCertificateId !== null) {
      // Validate base domain format
      if (!validateBaseDomain(npmAutoCreateDomain)) {
        console.error(`❌ Invalid NPM_AUTO_CREATE_DOMAIN: "${npmAutoCreateDomain}"`);
        console.error(`   Domain format is invalid (cannot contain wildcards, must be valid DNS name)`);
        console.error(`   NPM auto-creation disabled`);
        this.npmAutoCreateDomain = null;
        this.npmCertificateId = null;
        return;
      }

      // Valid domain - set configuration
      this.npmAutoCreateDomain = npmAutoCreateDomain;
      this.npmCertificateId = npmCertificateId;

      // Fetch certificate details asynchronously (don't block constructor)
      if (this.npmClient) {
        this.fetchCertificateDetails().catch(error => {
          console.error(`⚠️  Failed to fetch certificate details:`, error);
          console.error(`   Certificate domain validation will be skipped`);
        });
      }
    } else {
      this.npmAutoCreateDomain = null;
      this.npmCertificateId = null;
    }
  }

  /**
   * Fetch certificate details and cache domain names
   * Called during initialization to validate certificate coverage
   */
  private async fetchCertificateDetails(): Promise<void> {
    if (!this.npmClient || this.npmCertificateId === null) {
      return;
    }

    try {
      console.log(`📜 Fetching certificate ID ${this.npmCertificateId} details...`);
      const certificate = await this.npmClient.fetchCertificate(this.npmCertificateId);
      
      this.npmCertificateDomains = certificate.domain_names || [];
      
      console.log(`✅ Certificate covers domains: ${this.npmCertificateDomains.join(', ')}`);
      
      // Check if certificate has expired
      const expiresOn = new Date(certificate.expires_on);
      const now = new Date();
      if (expiresOn < now) {
        console.warn(`⚠️  WARNING: Certificate ID ${this.npmCertificateId} has expired on ${certificate.expires_on}`);
        console.warn(`   Auto-created proxy hosts may not work correctly`);
      }
    } catch (error) {
      console.error(`❌ Failed to fetch certificate ID ${this.npmCertificateId}:`, error);
      console.error(`   Certificate may not exist or NPM connection failed`);
      console.error(`   Domain validation will be skipped`);
    }
  }

  /**
   * Automatically create NPM proxy hosts for containers
   * Called during cache refresh when NPM auto-creation is enabled
   */
  private async autoCreateProxyHosts(
    containersWithEnv: Array<{ container: DockhandContainer; env: DockhandEnvironment }>,
    npmProxyHosts: NpmProxyHost[]
  ): Promise<void> {
    // Check if auto-creation is enabled
    if (!this.npmClient || !this.npmAutoCreateDomain || this.npmCertificateId === null) {
      return; // Auto-creation not configured
    }

    console.log('🔍 Checking for NPM proxy hosts to auto-create...');

    let createdCount = 0;
    let skippedCount = 0;

    for (const { container, env } of containersWithEnv) {
      // Only process running containers
      if (container.state !== 'running') {
        continue;
      }

      // Determine domain based on priority:
      // 1. dockhand-tavern.url (custom URL - extract domain)
      // 2. dockhand-tavern.name (custom name - sanitize and build)
      // 3. com.docker.compose.service (service name - sanitize and build)
      // 4. container.name (fallback - sanitize and build)

      let domain: string;
      let domainSource: 'custom-url' | 'custom-name' | 'service' | 'container';

      const customUrl = container.labels?.['dockhand-tavern.url'];

      if (customUrl) {
        // Priority 1: Custom URL
        const extractedDomain = extractDomainFromUrl(customUrl);
        
        if (!extractedDomain) {
          // Invalid URL - determine reason and skip
          let skipReason: string;
          
          if (!customUrl.startsWith('https://')) {
            skipReason = 'Only HTTPS URLs are supported for NPM auto-creation';
          } else if (customUrl.match(/:\d+/)) {
            skipReason = 'Custom ports are not supported';
          } else {
            skipReason = 'IP addresses are not supported';
          }
          
          console.log(`ℹ️  Skipping NPM creation for container "${container.name}"`);
          console.log(`   Custom URL: ${customUrl}`);
          console.log(`   Reason: ${skipReason}`);
          continue;
        }
        
        domain = extractedDomain;
        domainSource = 'custom-url';
        
      } else {
        // No custom URL - check for custom name, service name, or container name
        const customName = container.labels?.['dockhand-tavern.name'];
        const serviceName = container.labels?.['com.docker.compose.service'];
        
        let nameForDomain: string;
        
        if (customName) {
          // Priority 2: Custom name
          nameForDomain = customName;
          domainSource = 'custom-name';
        } else if (serviceName) {
          // Priority 3: Service name
          nameForDomain = serviceName;
          domainSource = 'service';
        } else {
          // Priority 4: Container name (fallback)
          nameForDomain = container.name;
          domainSource = 'container';
        }
        
        domain = buildDomainName(nameForDomain, this.npmAutoCreateDomain);
      }

      // Validate generated/extracted domain format
      if (!validateGeneratedDomain(domain)) {
        console.warn(`⚠️  Skipping NPM creation for container "${container.name}"`);
        console.warn(`   Domain "${domain}" is invalid`);
        console.warn(`   Domain contains invalid characters or format`);
        continue;
      }

      // Check if domain is covered by certificate (if certificate domains are cached)
      if (this.npmCertificateDomains.length > 0) {
        if (!isDomainCoveredByCertificate(domain, this.npmCertificateDomains)) {
          console.warn(`⚠️  Skipping NPM creation for container "${container.name}"`);
          console.warn(`   Generated domain "${domain}" is not covered by certificate ID ${this.npmCertificateId}`);
          console.warn(`   Certificate covers: [${this.npmCertificateDomains.join(', ')}]`);
          
          // Provide helpful suggestion for wildcard certificates
          const wildcardCert = this.npmCertificateDomains.find(d => d.startsWith('*.'));
          if (wildcardCert) {
            const baseDomain = wildcardCert.substring(2);
            if (domain.endsWith('.' + baseDomain)) {
              console.warn(`   Hint: Domain structure looks correct for wildcard ${wildcardCert}`);
              console.warn(`   Check that service name "${serviceName}" doesn't contain dots or invalid chars`);
            } else {
              console.warn(`   Hint: Consider using base domain "${baseDomain}" instead of "${this.npmAutoCreateDomain}"`);
            }
          }
          
          continue;
        }
      }

      // Check if this domain already exists in NPM (using sanitized name)
      const existingHost = findProxyHostByDomain(domain, npmProxyHosts);

      if (existingHost) {
        // Domain already exists - check if it points to the right target
        const ports = extractPorts(container.ports);
        const firstPort = ports.length > 0 ? ports[0] : null;

        if (firstPort) {
          const expectedHost = env.publicIp;
          const expectedPort = firstPort;

          if (existingHost.forward_host !== expectedHost || existingHost.forward_port !== expectedPort) {
            console.log(`⚠️  Domain mismatch detected:`);
            console.log(`   Domain: ${domain}`);
            console.log(`   Current target: ${existingHost.forward_host}:${existingHost.forward_port}`);
            console.log(`   Expected target: ${expectedHost}:${expectedPort}`);
            console.log(`   (Skipping - not auto-updating existing entries)`);
          }
        }

        skippedCount++;
        continue;
      }

      // Domain doesn't exist - create it
      // Extract ports
      const ports = extractPorts(container.ports);
      const firstPort = ports.length > 0 ? ports[0] : null;

      if (!firstPort) {
        console.log(`⚠️  Container ${container.name} has no exposed ports, skipping NPM creation`);
        continue;
      }

      // Determine access list ID based on dockhand-tavern.public label
      const isPublic = container.labels?.['dockhand-tavern.public'] === 'true';
      let accessListId = 0; // Default: no access list (public)

      if (isPublic && this.npmPublicAccessListId !== null) {
        accessListId = this.npmPublicAccessListId;
      } else if (!isPublic && this.npmDefaultAccessListId !== null) {
        accessListId = this.npmDefaultAccessListId;
      }

      // Build proxy host request
      const proxyHostRequest: NpmCreateProxyHostRequest = {
        domain_names: [domain],
        forward_scheme: 'http',
        forward_host: env.publicIp,
        forward_port: firstPort,
        access_list_id: accessListId,
        certificate_id: this.npmCertificateId,
        ssl_forced: true,
        http2_support: true,
        hsts_enabled: true,
        hsts_subdomains: false,
        caching_enabled: false,
        block_exploits: true,
        allow_websocket_upgrade: true,
        enabled: true,
      };

      try {
        // Log appropriate message based on domain source
        if (domainSource === 'custom-url') {
          console.log(`📡 Creating NPM proxy host from custom URL`);
          console.log(`   Container: ${container.name}`);
          console.log(`   Custom URL: ${customUrl}`);
          console.log(`   Extracted domain: ${domain}`);
        } else if (domainSource === 'custom-name') {
          console.log(`📡 Creating NPM proxy host from custom name`);
          console.log(`   Container: ${container.name}`);
          console.log(`   Custom name: "${container.labels?.['dockhand-tavern.name']}"`);
          console.log(`   Generated domain: ${domain}`);
        } else if (domainSource === 'service') {
          console.log(`📡 Creating NPM proxy host (auto-generated)`);
          console.log(`   Container: ${container.name}`);
          console.log(`   Service: ${container.labels?.['com.docker.compose.service']}`);
          console.log(`   Generated domain: ${domain}`);
        } else {
          console.log(`📡 Creating NPM proxy host (auto-generated)`);
          console.log(`   Container: ${container.name}`);
          console.log(`   Generated domain: ${domain}`);
        }
        
        console.log(`   Target: ${env.publicIp}:${firstPort}`);
        console.log(`   Access list: ${accessListId || 'none (public)'}`);
        
        const createdHost = await this.npmClient.createProxyHost(proxyHostRequest);
        console.log(`✅ Created NPM proxy host: ${domain} (ID: ${createdHost.id})`);
        createdCount++;

        // Track the auto-created domain for this container
        this.autoCreatedDomains.set(container.id, domain);
        
        // Add warning if custom URL also exists (conflict scenario)
        if (customUrl && domainSource === 'custom-url') {
          console.warn(`⚠️  Note: Container "${container.name}" has custom URL label`);
          console.warn(`   Created NPM entry: https://${domain}`);
          console.warn(`   Custom URL label: ${customUrl}`);
          console.warn(`   Frontend card will display: ${customUrl} (custom URL takes priority)`);
        }

        // Add to npmProxyHosts array so subsequent checks see it
        npmProxyHosts.push(createdHost);
      } catch (error) {
        console.error(`❌ Failed to create NPM proxy host for ${domain}:`, error);
      }
    }

    if (createdCount > 0 || skippedCount > 0) {
      console.log(`✅ NPM auto-creation complete: ${createdCount} created, ${skippedCount} skipped`);
    }
  }

  /**
   * Ensure tag exists in Peekaping, create if needed
   * Returns tag ID
   */
  private async ensureTag(
    name: string,
    color: string,
    description: string
  ): Promise<string> {
    // Check cache first
    if (this.tagCache.has(name)) {
      const cached = this.tagCache.get(name)!;
      
      // Log if colors differ
      if (cached.color !== color) {
        console.warn(`⚠️  Tag "${name}" exists with different color`);
        console.warn(`   Expected: ${color}, Found: ${cached.color}`);
        console.warn(`   Using existing tag (not updating)`);
      }
      
      return cached.id;
    }
    
    // Tag not in cache, create it
    try {
      const tag = await this.peekapingClient!.createTag({
        name,
        color,
        description,
      });
      
      this.tagCache.set(name, tag);
      console.log(`✅ Created tag: "${name}" (${color})`);
      return tag.id;
    } catch (error) {
      console.error(`❌ Failed to create tag "${name}":`, error);
      throw error;
    }
  }

  /**
   * Get or create environment tag
   */
  private async ensureEnvironmentTag(envName: string): Promise<string> {
    const tagName = `env:${envName}`;
    const color = generateTagColor(envName);
    const description = `Dockhand environment: ${envName}`;
    
    return this.ensureTag(tagName, color, description);
  }

  /**
   * Get or create group tag
   */
  private async ensureGroupTag(groupName: string): Promise<string> {
    const tagName = `group:${groupName}`;
    const color = generateTagColor(groupName);
    const description = `Service group: ${groupName}`;
    
    return this.ensureTag(tagName, color, description);
  }

  /**
   * Get or create dockhand-tavern tag
   */
  private async ensureDockhandTag(): Promise<string> {
    return this.ensureTag(
      this.DOCKHAND_TAG,
      this.DOCKHAND_TAG_COLOR,
      'Automatically created by Dockhand Tavern'
    );
  }

  /**
   * Automatically create Peekaping monitors for containers
   * Called during cache refresh when Peekaping client is enabled
   */
  private async autoCreateMonitors(
    containersWithEnv: Array<{ container: DockhandContainer; env: DockhandEnvironment }>,
    npmProxyHosts: NpmProxyHost[]
  ): Promise<void> {
    // Check if Peekaping client is configured
    if (!this.peekapingClient) {
      return; // Peekaping not configured
    }

    console.log('🔍 Checking for Peekaping monitors to auto-create...');

    let createdCount = 0;
    let skippedCount = 0;

    // Clear and load tag cache
    this.tagCache.clear();
    try {
      const tags = await this.peekapingClient.fetchTags();
      tags.forEach(tag => this.tagCache.set(tag.name, tag));
      console.log(`✅ Loaded ${tags.length} existing Peekaping tag(s)`);
    } catch (error) {
      console.error('⚠️  Failed to fetch Peekaping tags:', error);
      // Continue - we'll create tags as needed
    }

    // Fetch existing monitors
    let existingMonitors: PeekapingMonitor[] = [];
    try {
      existingMonitors = await this.peekapingClient.fetchMonitors();
      console.log(`✅ Fetched ${existingMonitors.length} existing Peekaping monitor(s)`);
    } catch (error) {
      console.error('⚠️  Failed to fetch Peekaping monitors:', error);
      return; // Can't proceed without knowing what monitors exist
    }

    for (const { container, env } of containersWithEnv) {
      // Only process running containers
      if (container.state !== 'running') {
        continue;
      }

      // Skip if monitor-disable label is set
      if (container.labels?.['dockhand-tavern.monitor-disable'] === 'true') {
        console.log(`ℹ️  Skipping monitor creation for "${container.name}" (monitor-disable label set)`);
        continue;
      }

      // Skip if dashboard-disable label is set (for backward compatibility)
      if (container.labels?.['dockhand-tavern.disable'] === 'true') {
        console.log(`ℹ️  Skipping monitor creation for "${container.name}" (disable label set)`);
        continue;
      }

      // Determine monitor URL and protocol
      let monitorUrl: string;
      let protocol: 'https' | 'http';
      let urlSource: 'npm-proxy' | 'custom-url' | 'local-ip';

      // Priority 1: NPM proxy host with domain
      const npmHost = findNpmProxyHostForContainer(container, env, npmProxyHosts);
      if (npmHost && npmHost.domain_names.length > 0) {
        protocol = 'https';
        monitorUrl = `https://${npmHost.domain_names[0]}`;
        urlSource = 'npm-proxy';
      }
      // Priority 2: Custom URL label
      else if (container.labels?.['dockhand-tavern.url']) {
        const customUrl = container.labels['dockhand-tavern.url'];
        protocol = customUrl.startsWith('https://') ? 'https' : 'http';
        monitorUrl = customUrl;
        urlSource = 'custom-url';
      }
      // Priority 3: Local IP:port
      else {
        const ports = extractPorts(container.ports);
        if (ports.length === 0) {
          console.log(`ℹ️  Skipping monitor creation for "${container.name}" (no exposed ports)`);
          continue;
        }
        protocol = 'http';
        monitorUrl = `http://${env.publicIp}:${ports[0]}`;
        urlSource = 'local-ip';
      }

      // Determine monitor name (use display name logic from processContainer)
      const displayName = 
        container.labels?.['dockhand-tavern.name'] || 
        container.labels?.['com.docker.compose.service'] || 
        container.name;

      // Check if monitor already exists
      // We check by BOTH name AND URL to prevent duplicates
      // This is stricter than checking just one or the other
      const existingMonitor = existingMonitors.find(monitor => {
        // Check if both name and URL match
        const nameMatches = monitor.name === displayName;
        
        let urlMatches = false;
        try {
          const config = JSON.parse(monitor.config || '{}');
          urlMatches = config.url === monitorUrl;
        } catch (e) {
          // Ignore parse errors
        }
        
        // Consider it a duplicate if EITHER name OR URL matches
        // This prevents both renamed duplicates and URL duplicates
        return nameMatches || urlMatches;
      });

      if (existingMonitor) {
        let matchReason = '';
        try {
          const config = JSON.parse(existingMonitor.config || '{}');
          if (existingMonitor.name === displayName && config.url === monitorUrl) {
            matchReason = 'name and URL match';
          } else if (existingMonitor.name === displayName) {
            matchReason = 'name matches';
          } else {
            matchReason = 'URL matches';
          }
        } catch (e) {
          matchReason = 'name matches';
        }
        
        console.log(`ℹ️  Monitor "${displayName}" already exists (${matchReason}, ID: ${existingMonitor.id})`);
        skippedCount++;
        
        // Track the existing monitor for this container
        this.autoCreatedMonitors.set(container.id, existingMonitor.id);
        continue;
      }

      // Collect tag IDs for this monitor
      const tagIds: string[] = [];
      try {
        // 1. Environment tag (always)
        const envTagId = await this.ensureEnvironmentTag(env.name);
        tagIds.push(envTagId);
        
        // 2. Group tag (only if label exists)
        const groupLabel = container.labels?.['dockhand-tavern.group'];
        if (groupLabel) {
          const groupTagId = await this.ensureGroupTag(groupLabel);
          tagIds.push(groupTagId);
        }
        
        // 3. Dockhand-tavern tag (always)
        const dockhandTagId = await this.ensureDockhandTag();
        tagIds.push(dockhandTagId);
      } catch (error) {
        console.error(`⚠️  Failed to prepare tags for "${displayName}":`, error);
        // Continue without tags rather than failing entirely
      }

      // Create new monitor
      const monitorRequest: PeekapingCreateMonitorRequest = {
        name: displayName,
        type: 'http',
        notification_ids: this.peekapingNotificationIds,
        config: JSON.stringify({
          url: monitorUrl,
          method: 'GET',
          encoding: 'json',
          authMethod: 'none',
          accepted_statuscodes: ['2XX'],
          headers: '{ "Content-Type": "application/json" }',
          body: '',
          max_redirects: 10,
          check_cert_expiry: false,
          ignore_tls_errors: false,
        }),
        active: true,
        interval: this.peekapingDefaultInterval,
        timeout: this.peekapingDefaultTimeout,
        max_retries: this.peekapingDefaultMaxRetries,
        retry_interval: this.peekapingDefaultInterval,
        tag_ids: tagIds,
      };

      try {
        console.log(`📊 Creating Peekaping monitor`);
        console.log(`   Container: ${container.name}`);
        console.log(`   Monitor name: ${displayName}`);
        console.log(`   URL: ${monitorUrl} (${urlSource})`);
        console.log(`   Protocol: ${protocol}`);
        console.log(`   Interval: ${this.peekapingDefaultInterval}s`);

        const createdMonitor = await this.peekapingClient.createMonitor(monitorRequest);
        console.log(`✅ Created Peekaping monitor: ${displayName} (ID: ${createdMonitor.id})`);
        createdCount++;

        // Track the auto-created monitor for this container
        this.autoCreatedMonitors.set(container.id, createdMonitor.id);

        // Add to existing monitors list so subsequent checks see it
        existingMonitors.push(createdMonitor);
      } catch (error) {
        console.error(`❌ Failed to create Peekaping monitor for ${displayName}:`, error);
      }
    }

    if (createdCount > 0 || skippedCount > 0) {
      console.log(`✅ Peekaping monitor auto-creation complete: ${createdCount} created, ${skippedCount} skipped`);
    }
  }

  /**
   * Refresh cache from Dockhand API (and optionally NPM)
   * This is the actual refresh logic (called by refreshDebounced)
   */
  private async doRefresh(client: DockhandClient): Promise<void> {
    try {
      console.log('Refreshing cache from Dockhand...');

      // Clear auto-created domains and monitors maps (will be rebuilt during this refresh)
      this.autoCreatedDomains.clear();
      this.autoCreatedMonitors.clear();

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

      // 3. Fetch raw containers for all environments
      const allRawContainers: Array<{ container: DockhandContainer; env: DockhandEnvironment }> = [];
      
      for (const env of environments) {
        try {
          const rawContainers = await client.fetchContainers(env.id);
          for (const container of rawContainers) {
            allRawContainers.push({ container, env });
          }
        } catch (error) {
          console.error(`Failed to fetch containers for env ${env.name}:`, error);
          // Continue with other environments
        }
      }

      // 4. Auto-create NPM proxy hosts (if enabled)
      await this.autoCreateProxyHosts(allRawContainers, npmProxyHosts);

      // 5. Auto-create Peekaping monitors (if enabled)
      await this.autoCreateMonitors(allRawContainers, npmProxyHosts);

      // 6. Process containers for display
      const allContainers: ProcessedContainer[] = [];

      for (const item of allRawContainers) {
        // Get auto-created domain for this container (if any)
        const autoCreatedDomain = this.autoCreatedDomains.get(item.container.id);
        
        // Pass NPM proxy hosts and auto-created domain to processContainer
        const processed = processContainer(item.container, item.env, npmProxyHosts, autoCreatedDomain);
        if (processed) {
          allContainers.push(processed);
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
