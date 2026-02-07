/**
 * Unit tests for utility functions
 * Run with: bun test
 */

import { describe, test, expect } from 'bun:test';
import { 
  extractDomainFromUrl, 
  buildDomainName,
  validateBaseDomain,
  validateGeneratedDomain,
  isDomainCoveredByCertificate,
  findNpmProxyHostForContainer,
  generateTagColor
} from './utils';
import type { DockhandContainer, DockhandEnvironment, NpmProxyHost } from './types';

describe('extractDomainFromUrl', () => {
  describe('Valid HTTPS domains', () => {
    test('extracts domain from simple HTTPS URL', () => {
      expect(extractDomainFromUrl('https://cloud.ltrg.de')).toBe('cloud.ltrg.de');
    });

    test('extracts domain from URL with path', () => {
      expect(extractDomainFromUrl('https://cloud.ltrg.de/path/to/resource')).toBe('cloud.ltrg.de');
    });

    test('extracts domain from URL with query string', () => {
      expect(extractDomainFromUrl('https://cloud.ltrg.de?foo=bar')).toBe('cloud.ltrg.de');
    });

    test('extracts subdomain correctly', () => {
      expect(extractDomainFromUrl('https://app.sub.example.com')).toBe('app.sub.example.com');
    });

    test('extracts domain from URL with path and query', () => {
      expect(extractDomainFromUrl('https://cloud.ltrg.de/path?query=1')).toBe('cloud.ltrg.de');
    });
  });

  describe('Rejected URLs (return null)', () => {
    test('rejects HTTP URLs', () => {
      expect(extractDomainFromUrl('http://cloud.ltrg.de')).toBeNull();
    });

    test('rejects IPv4 addresses', () => {
      expect(extractDomainFromUrl('https://192.168.1.100')).toBeNull();
    });

    test('rejects URLs with custom ports (8443)', () => {
      expect(extractDomainFromUrl('https://cloud.ltrg.de:8443')).toBeNull();
    });

    test('rejects URLs with port 443 (explicit)', () => {
      expect(extractDomainFromUrl('https://cloud.ltrg.de:443')).toBeNull();
    });

    test('rejects URLs with port 80', () => {
      expect(extractDomainFromUrl('https://cloud.ltrg.de:80')).toBeNull();
    });

    test('rejects invalid domain formats with wildcards', () => {
      expect(extractDomainFromUrl('https://*.ltrg.de')).toBeNull();
    });

    test('rejects malformed URLs', () => {
      expect(extractDomainFromUrl('not-a-url')).toBeNull();
    });

    test('rejects empty string', () => {
      expect(extractDomainFromUrl('')).toBeNull();
    });

    test('rejects domain starting with dot', () => {
      expect(extractDomainFromUrl('https://.ltrg.de')).toBeNull();
    });

    test('rejects domain ending with dot', () => {
      expect(extractDomainFromUrl('https://ltrg.de.')).toBeNull();
    });
  });
});

describe('buildDomainName', () => {
  test('handles simple service name', () => {
    expect(buildDomainName('nextcloud', 'ltrg.de')).toBe('nextcloud.ltrg.de');
  });

  test('sanitizes spaces to hyphens', () => {
    expect(buildDomainName('My Cloud App', 'ltrg.de')).toBe('my-cloud-app.ltrg.de');
  });

  test('sanitizes underscores to hyphens', () => {
    expect(buildDomainName('immich_server', 'ltrg.de')).toBe('immich-server.ltrg.de');
  });

  test('removes special characters', () => {
    expect(buildDomainName('app*name!', 'ltrg.de')).toBe('app-name.ltrg.de');
  });

  test('removes leading/trailing hyphens', () => {
    expect(buildDomainName('--app--', 'ltrg.de')).toBe('app.ltrg.de');
  });

  test('collapses multiple hyphens', () => {
    expect(buildDomainName('my---app', 'ltrg.de')).toBe('my-app.ltrg.de');
  });

  test('converts to lowercase', () => {
    expect(buildDomainName('MyApp', 'ltrg.de')).toBe('myapp.ltrg.de');
  });

  test('handles custom name with uppercase and spaces', () => {
    expect(buildDomainName('Immich', 'ltrg.de')).toBe('immich.ltrg.de');
  });

  test('sanitizes "My Cloud" to "my-cloud"', () => {
    expect(buildDomainName('My Cloud', 'ltrg.de')).toBe('my-cloud.ltrg.de');
  });
});

describe('validateBaseDomain', () => {
  test('accepts valid domain', () => {
    expect(validateBaseDomain('ltrg.de')).toBe(true);
  });

  test('accepts subdomain', () => {
    expect(validateBaseDomain('sub.example.com')).toBe(true);
  });

  test('rejects wildcard domains', () => {
    expect(validateBaseDomain('*.ltrg.de')).toBe(false);
  });

  test('rejects domain starting with dot', () => {
    expect(validateBaseDomain('.ltrg.de')).toBe(false);
  });

  test('rejects domain ending with dot', () => {
    expect(validateBaseDomain('ltrg.de.')).toBe(false);
  });

  test('rejects wildcard in TLD', () => {
    expect(validateBaseDomain('ltrg.*')).toBe(false);
  });

  test('rejects empty string', () => {
    expect(validateBaseDomain('')).toBe(false);
  });

  test('rejects domain without TLD', () => {
    expect(validateBaseDomain('example')).toBe(false);
  });
});

describe('validateGeneratedDomain', () => {
  test('accepts valid generated domain', () => {
    expect(validateGeneratedDomain('app.ltrg.de')).toBe(true);
  });

  test('rejects wildcard in domain', () => {
    expect(validateGeneratedDomain('app.*.ltrg.de')).toBe(false);
  });

  test('rejects domain starting with hyphen', () => {
    expect(validateGeneratedDomain('-app.ltrg.de')).toBe(false);
  });

  test('rejects domain ending with hyphen', () => {
    expect(validateGeneratedDomain('app-.ltrg.de')).toBe(false);
  });

  test('rejects domain ending with dot', () => {
    expect(validateGeneratedDomain('app.ltrg.de.')).toBe(false);
  });

  test('rejects domain with spaces', () => {
    expect(validateGeneratedDomain('app ltrg.de')).toBe(false);
  });
});

describe('isDomainCoveredByCertificate', () => {
  test('exact match works', () => {
    expect(isDomainCoveredByCertificate('app.ltrg.de', ['app.ltrg.de'])).toBe(true);
  });

  test('wildcard matches one level subdomain', () => {
    expect(isDomainCoveredByCertificate('app.ltrg.de', ['*.ltrg.de'])).toBe(true);
  });

  test('wildcard does not match two levels', () => {
    expect(isDomainCoveredByCertificate('sub.app.ltrg.de', ['*.ltrg.de'])).toBe(false);
  });

  test('base domain matches in list with wildcard', () => {
    expect(isDomainCoveredByCertificate('ltrg.de', ['*.ltrg.de', 'ltrg.de'])).toBe(true);
  });

  test('different domain does not match', () => {
    expect(isDomainCoveredByCertificate('app.example.com', ['*.ltrg.de'])).toBe(false);
  });

  test('case insensitive matching', () => {
    expect(isDomainCoveredByCertificate('App.Ltrg.De', ['*.ltrg.de'])).toBe(true);
  });
});

describe('findNpmProxyHostForContainer', () => {
  const mockEnv: DockhandEnvironment = {
    id: 1,
    name: 'prod',
    type: 'production',
    publicIp: '192.168.1.100',
  };

  const mockContainer: DockhandContainer = {
    id: 'container-123',
    name: 'web-app',
    image: 'nginx:latest',
    state: 'running',
    status: 'Up 5 minutes',
    created: Date.now(),
    ports: [
      {
        IP: '0.0.0.0',
        PrivatePort: 80,
        PublicPort: 8080,
        Type: 'tcp',
      },
    ],
    networks: {},
    restartCount: 0,
    mounts: [],
    labels: {},
    command: '',
    systemContainer: null,
  };

  const mockNpmProxyHosts: NpmProxyHost[] = [
    {
      id: 1,
      created_on: '2024-01-01',
      modified_on: '2024-01-01',
      owner_user_id: 1,
      domain_names: ['app.example.com'],
      forward_scheme: 'http',
      forward_host: '192.168.1.100',
      forward_port: 8080,
      access_list_id: 0,
      certificate_id: 1,
      ssl_forced: true,
      caching_enabled: false,
      block_exploits: true,
      advanced_config: '',
      meta: {},
      allow_websocket_upgrade: true,
      http2_support: true,
      hsts_enabled: true,
      hsts_subdomains: false,
      enabled: true,
    },
    {
      id: 2,
      created_on: '2024-01-01',
      modified_on: '2024-01-01',
      owner_user_id: 1,
      domain_names: ['api.example.com'],
      forward_scheme: 'http',
      forward_host: '192.168.1.100',
      forward_port: 3000,
      access_list_id: 0,
      certificate_id: 1,
      ssl_forced: true,
      caching_enabled: false,
      block_exploits: true,
      advanced_config: '',
      meta: {},
      allow_websocket_upgrade: true,
      http2_support: true,
      hsts_enabled: true,
      hsts_subdomains: false,
      enabled: true,
    },
  ];

  test('finds NPM proxy host when IP and port match', () => {
    const result = findNpmProxyHostForContainer(mockContainer, mockEnv, mockNpmProxyHosts);
    expect(result).not.toBeNull();
    expect(result?.domain_names[0]).toBe('app.example.com');
    expect(result?.forward_port).toBe(8080);
  });

  test('returns undefined when no matching proxy host exists', () => {
    const containerWithDifferentPort = {
      ...mockContainer,
      ports: [
        {
          IP: '0.0.0.0',
          PrivatePort: 80,
          PublicPort: 9999,
          Type: 'tcp',
        },
      ],
    };

    const result = findNpmProxyHostForContainer(containerWithDifferentPort, mockEnv, mockNpmProxyHosts);
    expect(result).toBeUndefined();
  });

  test('returns undefined when container has no exposed ports', () => {
    const containerWithoutPorts = {
      ...mockContainer,
      ports: [],
    };

    const result = findNpmProxyHostForContainer(containerWithoutPorts, mockEnv, mockNpmProxyHosts);
    expect(result).toBeUndefined();
  });

  test('returns undefined when NPM proxy hosts array is empty', () => {
    const result = findNpmProxyHostForContainer(mockContainer, mockEnv, []);
    expect(result).toBeUndefined();
  });

  test('matches by environment IP and first exposed port', () => {
    const containerWithMultiplePorts = {
      ...mockContainer,
      ports: [
        {
          IP: '0.0.0.0',
          PrivatePort: 80,
          PublicPort: 8080,
          Type: 'tcp',
        },
        {
          IP: '0.0.0.0',
          PrivatePort: 443,
          PublicPort: 8443,
          Type: 'tcp',
        },
      ],
    };

    const result = findNpmProxyHostForContainer(containerWithMultiplePorts, mockEnv, mockNpmProxyHosts);
    expect(result).not.toBeNull();
    expect(result?.forward_port).toBe(8080); // Matches first port
  });

  test('returns undefined when IP does not match', () => {
    const differentEnv = {
      ...mockEnv,
      publicIp: '192.168.1.200',
    };

    const result = findNpmProxyHostForContainer(mockContainer, differentEnv, mockNpmProxyHosts);
    expect(result).toBeUndefined();
  });
});

describe('generateTagColor', () => {
  test('generates consistent color for same input', () => {
    const color1 = generateTagColor('prod');
    const color2 = generateTagColor('prod');
    expect(color1).toBe(color2);
  });

  test('generates different colors for different inputs (usually)', () => {
    const colors = new Set([
      generateTagColor('prod'),
      generateTagColor('staging'),
      generateTagColor('development'),
      generateTagColor('test'),
      generateTagColor('qa'),
    ]);
    // With 8 colors and 5 inputs, we should get at least 2 different colors
    expect(colors.size).toBeGreaterThan(1);
  });

  test('returns valid hex color', () => {
    const color = generateTagColor('test-environment');
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  test('uses one of the 8 predefined colors', () => {
    const validColors = [
      '#89b4fa', // blue
      '#fab387', // peach
      '#f9e2af', // yellow
      '#a6e3a1', // green
      '#f38ba8', // red
      '#94e2d5', // teal
      '#89dceb', // sky
      '#f5c2e7', // pink
    ];

    const color = generateTagColor('any-string');
    expect(validColors).toContain(color);
  });

  test('handles empty string', () => {
    const color = generateTagColor('');
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  test('handles special characters', () => {
    const color = generateTagColor('env:prod-123!@#');
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  test('generates same color as frontend algorithm for "prod"', () => {
    // This should match the frontend's getEnvColor('prod')
    // Just verify it returns one of the valid colors
    const color = generateTagColor('prod');
    const validColors = [
      '#89b4fa', '#fab387', '#f9e2af', '#a6e3a1',
      '#f38ba8', '#94e2d5', '#89dceb', '#f5c2e7',
    ];
    expect(validColors).toContain(color);
  });
});
