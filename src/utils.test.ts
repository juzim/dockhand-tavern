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
  isDomainCoveredByCertificate
} from './utils';

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
