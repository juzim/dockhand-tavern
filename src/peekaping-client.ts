/**
 * Peekaping API Client
 * Handles API key authentication and requests to Peekaping
 */

import type { 
  PeekapingMonitor, 
  PeekapingCreateMonitorRequest,
  PeekapingApiResponse 
} from './peekaping-types';

export class PeekapingClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.apiKey = apiKey;
  }

  /**
   * Make authenticated GET request to Peekaping API
   */
  private async request<T>(path: string): Promise<T> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        headers: {
          'X-API-Key': this.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Peekaping request failed: ${response.status}`);
      }

      const data: PeekapingApiResponse<T> = await response.json();
      
      // Handle missing or null data field
      if (data.data === null || data.data === undefined) {
        return (Array.isArray([]) ? [] : {}) as T;
      }
      
      return data.data;
    } catch (error) {
      console.error(`Peekaping API request error (${path}):`, error);
      throw error;
    }
  }

  /**
   * Make authenticated POST request to Peekaping API
   */
  private async postRequest<T>(path: string, body: any): Promise<T> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`Peekaping POST request failed: ${response.status}`);
      }

      const data: PeekapingApiResponse<T> = await response.json();
      return data.data;
    } catch (error) {
      console.error(`Peekaping API POST request error (${path}):`, error);
      throw error;
    }
  }

  /**
   * Fetch all monitors from Peekaping
   */
  async fetchMonitors(): Promise<PeekapingMonitor[]> {
    // Fetch with high limit to get all monitors (default is 10)
    return this.request<PeekapingMonitor[]>('/api/v1/monitors?limit=1000');
  }

  /**
   * Create a new monitor in Peekaping
   */
  async createMonitor(data: PeekapingCreateMonitorRequest): Promise<PeekapingMonitor> {
    return this.postRequest<PeekapingMonitor>('/api/v1/monitors', data);
  }

  /**
   * Test connection to Peekaping
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.fetchMonitors();
      return true;
    } catch (error) {
      return false;
    }
  }
}
