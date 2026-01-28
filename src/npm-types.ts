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
