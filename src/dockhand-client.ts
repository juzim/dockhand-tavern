/**
 * Dockhand API Client
 * Handles authentication and API requests to Dockhand
 */

import type { DockhandEnvironment, DockhandContainer } from './types';

export class DockhandClient {
  private baseUrl: string;
  private username: string;
  private password: string;
  private sessionCookie: string | null = null;

  constructor(baseUrl: string, username: string, password: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.username = username;
    this.password = password;
  }

  /**
   * Authenticate with Dockhand and get session cookie
   */
  private async authenticate(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: this.username,
          password: this.password,
        }),
      });

      if (!response.ok) {
        throw new Error(`Authentication failed: ${response.status}`);
      }

      // Extract session cookie
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) {
        this.sessionCookie = setCookie;
      } else {
        throw new Error('No session cookie received from Dockhand');
      }
    } catch (error) {
      console.error('Dockhand authentication error:', error);
      throw error;
    }
  }

  /**
   * Ensure we have a valid session
   */
  private async ensureAuthenticated(): Promise<void> {
    if (!this.sessionCookie) {
      await this.authenticate();
    }
  }

  /**
   * Make authenticated request to Dockhand API
   */
  private async request<T>(path: string): Promise<T> {
    await this.ensureAuthenticated();

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        headers: {
          Cookie: this.sessionCookie!,
        },
      });

      if (response.status === 401) {
        // Session expired, re-authenticate and retry
        this.sessionCookie = null;
        await this.authenticate();
        
        const retryResponse = await fetch(`${this.baseUrl}${path}`, {
          headers: {
            Cookie: this.sessionCookie!,
          },
        });

        if (!retryResponse.ok) {
          throw new Error(`Request failed: ${retryResponse.status}`);
        }

        return retryResponse.json();
      }

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      console.error(`Dockhand API request error (${path}):`, error);
      throw error;
    }
  }

  /**
   * Fetch all environments
   */
  async fetchEnvironments(): Promise<DockhandEnvironment[]> {
    return this.request<DockhandEnvironment[]>('/api/environments');
  }

  /**
   * Fetch containers for a specific environment
   */
  async fetchContainers(environmentId: number): Promise<DockhandContainer[]> {
    return this.request<DockhandContainer[]>(`/api/containers?env=${environmentId}`);
  }

  /**
   * Test connection to Dockhand
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
