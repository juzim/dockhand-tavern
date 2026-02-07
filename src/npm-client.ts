/**
 * Nginx Proxy Manager API Client
 * Handles authentication and API requests to NPM
 */

import type { NpmProxyHost, NpmAuthResponse, NpmCreateProxyHostRequest, NpmCertificate } from './npm-types';
import { logger } from './logger';

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
      logger.error('[NPM] Authentication error:', error);
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
      logger.error(`[NPM] API request error (${path}):`, error);
      throw error;
    }
  }

  /**
   * Make authenticated POST request to NPM API
   */
  private async postRequest<T>(path: string, body: any): Promise<T> {
    await this.ensureAuthenticated();

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (response.status === 401) {
        // Token expired, re-authenticate and retry
        this.token = null;
        await this.authenticate();
        
        const retryResponse = await fetch(`${this.baseUrl}${path}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (!retryResponse.ok) {
          throw new Error(`NPM POST request failed: ${retryResponse.status}`);
        }

        return retryResponse.json();
      }

      if (!response.ok) {
        throw new Error(`NPM POST request failed: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      logger.error(`[NPM] API POST request error (${path}):`, error);
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
   * Create a new proxy host in NPM
   */
  async createProxyHost(data: NpmCreateProxyHostRequest): Promise<NpmProxyHost> {
    return this.postRequest<NpmProxyHost>('/api/nginx/proxy-hosts', data);
  }

  /**
   * Fetch certificate details by ID from NPM
   */
  async fetchCertificate(certificateId: number): Promise<NpmCertificate> {
    return this.request<NpmCertificate>(`/api/nginx/certificates/${certificateId}`);
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
