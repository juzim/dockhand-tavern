/**
 * Peekaping API Type Definitions
 * Based on: Peekaping API v0.0.45
 */

export interface PeekapingMonitor {
  id: string;
  name: string;
  type: string;
  active: boolean;
  config: string;
  interval: number;
  timeout: number;
  max_retries: number;
  retry_interval: number;
  resend_interval: number;
  notification_ids: string[];
  tag_ids: string[];
  proxy_id?: string;
  push_token?: string;
  created_at: string;
  updated_at: string;
}

export interface PeekapingCreateMonitorRequest {
  name: string;                    // Required: monitor name (min 3 chars)
  type: string;                    // Required: "http", "tcp", "ping"
  notification_ids: string[];      // Required: array of notification IDs (can be empty)
  config?: string;                 // Optional: JSON config for monitor type
  active?: boolean;                // Optional: default true
  interval?: number;               // Optional: seconds (min 20, default 60)
  timeout?: number;                // Optional: seconds (min 16, default 16)
  max_retries?: number;            // Optional: default 3
  retry_interval?: number;         // Optional: seconds (min 20)
  resend_interval?: number;        // Optional: minutes
  tag_ids?: string[];              // Optional: array of tag IDs
  proxy_id?: string;               // Optional: proxy ID
}

export interface PeekapingAuthResponse {
  token: string;
  expires?: string;
  user?: {
    id: string;
    email: string;
    name: string;
  };
}

export interface PeekapingMonitorsResponse {
  data: PeekapingMonitor[];
  meta?: {
    total: number;
    page: number;
    limit: number;
  };
}

export interface PeekapingApiResponse<T> {
  data: T;
  message?: string;
  success?: boolean;
}

export interface PeekapingTag {
  id: string;
  name: string;
  color: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface PeekapingCreateTagRequest {
  name: string;                    // Required: tag name (max 100 chars)
  color: string;                   // Required: hex color (e.g., "#3B82F6")
  description?: string;            // Optional: tag description
}
