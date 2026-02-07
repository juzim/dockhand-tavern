/**
 * Unit tests for Peekaping API Client
 * Run with: bun test
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { PeekapingClient } from './peekaping-client';
import type { PeekapingMonitor, PeekapingCreateMonitorRequest } from './peekaping-types';

describe('PeekapingClient', () => {
  let client: PeekapingClient;
  const baseUrl = 'http://localhost:8034';
  const apiKey = 'test-api-key-123';

  beforeEach(() => {
    client = new PeekapingClient(baseUrl, apiKey);
  });

  describe('constructor', () => {
    test('removes trailing slash from baseUrl', () => {
      const clientWithSlash = new PeekapingClient('http://localhost:8034/', apiKey);
      expect(clientWithSlash['baseUrl']).toBe('http://localhost:8034');
    });

    test('keeps baseUrl without trailing slash unchanged', () => {
      expect(client['baseUrl']).toBe('http://localhost:8034');
    });

    test('stores apiKey correctly', () => {
      expect(client['apiKey']).toBe(apiKey);
    });
  });

  describe('fetchMonitors', () => {
    test('makes GET request to /api/v1/monitors with API key header', async () => {
      const mockMonitors: PeekapingMonitor[] = [
        {
          id: '123',
          name: 'Test Monitor',
          type: 'http',
          active: true,
          config: '{"url":"https://example.com"}',
          interval: 60,
          timeout: 16,
          max_retries: 3,
          retry_interval: 60,
          resend_interval: 10,
          notification_ids: [],
          tag_ids: [],
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];

      const mockFetch = mock(async (url: string, options: any) => {
        expect(url).toBe('http://localhost:8034/api/v1/monitors?limit=1000');
        expect(options.headers['X-API-Key']).toBe(apiKey);
        return {
          ok: true,
          json: async () => ({ data: mockMonitors }),
        };
      });

      globalThis.fetch = mockFetch as any;

      const result = await client.fetchMonitors();
      expect(result).toEqual(mockMonitors);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test('handles empty monitors list', async () => {
      const mockFetch = mock(async () => ({
        ok: true,
        json: async () => ({ data: [] }),
      }));

      globalThis.fetch = mockFetch as any;

      const result = await client.fetchMonitors();
      expect(result).toEqual([]);
    });

    test('handles response without data field', async () => {
      const mockFetch = mock(async () => ({
        ok: true,
        json: async () => ({}),
      }));

      globalThis.fetch = mockFetch as any;

      const result = await client.fetchMonitors();
      expect(result).toEqual([]);
    });

    test('handles null data field', async () => {
      const mockFetch = mock(async () => ({
        ok: true,
        json: async () => ({ data: null }),
      }));

      globalThis.fetch = mockFetch as any;

      const result = await client.fetchMonitors();
      expect(result).toEqual([]);
    });

    test('throws error on failed request', async () => {
      const mockFetch = mock(async () => ({
        ok: false,
        status: 500,
      }));

      globalThis.fetch = mockFetch as any;

      await expect(client.fetchMonitors()).rejects.toThrow('Peekaping request failed: 500');
    });

    test('throws error on 401 unauthorized', async () => {
      const mockFetch = mock(async () => ({
        ok: false,
        status: 401,
      }));

      globalThis.fetch = mockFetch as any;

      await expect(client.fetchMonitors()).rejects.toThrow('Peekaping request failed: 401');
    });
  });

  describe('createMonitor', () => {
    test('makes POST request to /api/v1/monitors with correct data', async () => {
      const monitorRequest: PeekapingCreateMonitorRequest = {
        name: 'New Monitor',
        type: 'http',
        notification_ids: ['notif-123'],
        config: '{"url":"https://example.com"}',
        active: true,
        interval: 60,
        timeout: 16,
        max_retries: 3,
      };

      const createdMonitor: PeekapingMonitor = {
        id: 'mon-456',
        ...monitorRequest,
        config: monitorRequest.config!,
        retry_interval: 60,
        resend_interval: 10,
        tag_ids: [],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const mockFetch = mock(async (url: string, options: any) => {
        expect(url).toBe('http://localhost:8034/api/v1/monitors');
        expect(options.method).toBe('POST');
        expect(options.headers['X-API-Key']).toBe(apiKey);
        expect(options.headers['Content-Type']).toBe('application/json');
        
        const body = JSON.parse(options.body);
        expect(body).toEqual(monitorRequest);

        return {
          ok: true,
          json: async () => ({ data: createdMonitor }),
        };
      });

      globalThis.fetch = mockFetch as any;

      const result = await client.createMonitor(monitorRequest);
      expect(result).toEqual(createdMonitor);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test('creates monitor with empty notification_ids', async () => {
      const monitorRequest: PeekapingCreateMonitorRequest = {
        name: 'Monitor Without Notifications',
        type: 'http',
        notification_ids: [],
        config: '{"url":"https://example.com"}',
      };

      const mockFetch = mock(async (url: string, options: any) => {
        const body = JSON.parse(options.body);
        expect(body.notification_ids).toEqual([]);
        
        return {
          ok: true,
          json: async () => ({ 
            data: { 
              id: 'mon-789', 
              ...monitorRequest,
              active: true,
              interval: 60,
              timeout: 16,
              max_retries: 3,
              retry_interval: 60,
              resend_interval: 10,
              tag_ids: [],
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
            } 
          }),
        };
      });

      globalThis.fetch = mockFetch as any;

      const result = await client.createMonitor(monitorRequest);
      expect(result.notification_ids).toEqual([]);
    });

    test('throws error on 400 bad request', async () => {
      const mockFetch = mock(async () => ({
        ok: false,
        status: 400,
      }));

      globalThis.fetch = mockFetch as any;

      const monitorRequest: PeekapingCreateMonitorRequest = {
        name: 'Invalid',
        type: 'http',
        notification_ids: [],
      };

      await expect(client.createMonitor(monitorRequest)).rejects.toThrow(
        'Peekaping POST request failed: 400'
      );
    });

    test('throws error on 500 server error', async () => {
      const mockFetch = mock(async () => ({
        ok: false,
        status: 500,
      }));

      globalThis.fetch = mockFetch as any;

      const monitorRequest: PeekapingCreateMonitorRequest = {
        name: 'Test',
        type: 'http',
        notification_ids: [],
      };

      await expect(client.createMonitor(monitorRequest)).rejects.toThrow(
        'Peekaping POST request failed: 500'
      );
    });
  });

  describe('testConnection', () => {
    test('returns true when API key is valid', async () => {
      const mockFetch = mock(async () => ({
        ok: true,
        json: async () => ({ data: [] }),
      }));

      globalThis.fetch = mockFetch as any;

      const result = await client.testConnection();
      expect(result).toBe(true);
    });

    test('returns false when API key is invalid (401)', async () => {
      const mockFetch = mock(async () => ({
        ok: false,
        status: 401,
      }));

      globalThis.fetch = mockFetch as any;

      const result = await client.testConnection();
      expect(result).toBe(false);
    });

    test('returns false on network error', async () => {
      const mockFetch = mock(async () => {
        throw new Error('Network error');
      });

      globalThis.fetch = mockFetch as any;

      const result = await client.testConnection();
      expect(result).toBe(false);
    });

    test('returns false on server error (500)', async () => {
      const mockFetch = mock(async () => ({
        ok: false,
        status: 500,
      }));

      globalThis.fetch = mockFetch as any;

      const result = await client.testConnection();
      expect(result).toBe(false);
    });
  });
});
