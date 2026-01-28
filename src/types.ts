/**
 * TypeScript type definitions for Dockhand Dashboard
 */

// Export NPM types
export type { NpmProxyHost, NpmAuthResponse } from './npm-types';

// Dockhand API Response Types
export interface DockhandEnvironment {
  id: number;
  name: string;
  type: string;
  publicIp: string;
}

export interface DockhandPort {
  IP: string;           // "0.0.0.0" or "::"
  PrivatePort: number;  // Container internal port
  PublicPort: number;   // Host exposed port
  Type: string;         // "tcp" | "udp"
}

export interface DockhandContainer {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  created: number;
  ports: DockhandPort[];
  networks: Record<string, { ipAddress: string }>;
  health?: string;
  restartCount: number;
  mounts: any[];
  labels: Record<string, string>;
  command: string;
  systemContainer: any;
}

// Processed Data for Display
export interface ProcessedContainer {
  id: string;
  displayName: string;
  group: string;
  environment: {
    id: number;
    name: string;
    publicIp: string;
  };
  url: string;
  icon?: string;
  iconUrl: string;
  image: string;
}

// Cache Structure
export interface CacheData {
  environments: DockhandEnvironment[];
  containers: ProcessedContainer[];
  lastUpdate: Date;
  error?: string;
}

// Filter Options
export interface FilterOptions {
  search?: string;
  env?: string;
}
