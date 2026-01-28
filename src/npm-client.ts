/**
 * Nginx Proxy Manager API Client
 * Handles authentication and API requests to NPM
 */

import type { NpmProxyHost, NpmAuthResponse } from './npm-types';

export class NpmClient {
  private baseUrl: string;
  private email: string;
  private password: string;
  private token: string | null = null;

  constructor(baseUrl: string, email: string, password: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.email = email;
    this.password = password;
  }

  /**
   * Authenticate with NPM and get JWT token
   */
  private async authenticate(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          identity: this.email,
          secret: this.password,
        }),
      });

      if (!response.ok) {
        throw new Error(`NPM authentication failed: ${response.status}`);
      }

      const data: NpmAuthResponse = await response.json();
      this.token = data.token;
    } catch (error) {
      console.error('NPM authentication error:', error);
      throw error;
    }
  }

  /**
   * Ensure we have a valid token
   */
  private async ensureAuthenticated(): Promise<void> {
    if (!this.token) {
      await this.authenticate();
    }
  }

  /**
   * Make authenticated request to NPM API
   */
  private async request<T>(path: string): Promise<T> {
    await this.ensureAuthenticated();

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      if (response.status === 401) {
        // Token expired, re-authenticate and retry
        this.token = null;
        await this.authenticate();
        
        const retryResponse = await fetch(`${this.baseUrl}${path}`, {
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        });

        if (!retryResponse.ok) {
          throw new Error(`NPM request failed: ${retryResponse.status}`);
        }

        return retryResponse.json();
      }

      if (!response.ok) {
        throw new Error(`NPM request failed: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      console.error(`NPM API request error (${path}):`, error);
      throw error;
    }
  }

  /**
   * Fetch all proxy hosts from NPM
   */
  async fetchProxyHosts(): Promise<NpmProxyHost[]> {
    return this.request<NpmProxyHost[]>('/api/nginx/proxy-hosts');
  }

  /**
   * Test connection to NPM
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.authenticate();
      return true;
    } catch (error) {
      return false;
    }
  }
}
