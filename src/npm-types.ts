/**
 * Nginx Proxy Manager API Type Definitions
 * Based on: https://deepwiki.com/NginxProxyManager/nginx-proxy-manager/9.3-proxy-hosts-api
 */

export interface NpmProxyHost {
  id: number;
  created_on: string;
  modified_on: string;
  owner_user_id: number;
  domain_names: string[];           // e.g., ["example.com", "www.example.com"]
  forward_scheme: string;            // "http" or "https"
  forward_host: string;              // IP or hostname
  forward_port: number;              // Port number
  access_list_id: number;
  certificate_id: number;
  ssl_forced: boolean;               // Force HTTPS redirect
  caching_enabled: boolean;
  block_exploits: boolean;
  advanced_config: string;
  meta: Record<string, any>;
  allow_websocket_upgrade: boolean;
  http2_support: boolean;
  hsts_enabled: boolean;
  hsts_subdomains: boolean;
  enabled: boolean;                  // Whether proxy host is enabled
}

export interface NpmAuthResponse {
  token: string;
  expires: string;
  user: {
    id: number;
    created_on: string;
    modified_on: string;
    email: string;
    name: string;
    nickname: string;
    avatar: string;
    is_disabled: boolean;
  };
}

export interface NpmCreateProxyHostRequest {
  domain_names: string[];           // Array of domain names
  forward_scheme: string;            // "http" or "https"
  forward_host: string;              // IP or hostname
  forward_port: number;              // Port number
  access_list_id: number;            // 0 for none, or specific access list ID
  certificate_id: number;            // Certificate ID
  ssl_forced: boolean;               // Force HTTPS redirect
  http2_support: boolean;            // Enable HTTP/2
  hsts_enabled: boolean;             // Enable HSTS
  hsts_subdomains: boolean;          // Include subdomains in HSTS
  caching_enabled: boolean;          // Enable caching
  block_exploits: boolean;           // Block common exploits
  allow_websocket_upgrade: boolean;  // Allow websocket upgrade
  enabled: boolean;                  // Enable proxy host
}

export interface NpmCertificate {
  id: number;
  created_on: string;
  modified_on: string;
  provider: string;                  // "letsencrypt" or "other"
  nice_name: string;                 // Display name
  domain_names: string[];            // Domains covered (may include wildcards like *.example.com)
  expires_on: string;                // ISO date string
  owner_user_id: number;
  is_deleted: number;                // 0 or 1
  meta: Record<string, any>;         // Provider-specific metadata
}
