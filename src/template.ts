/**
 * HTML Template Renderer
 * Server-side rendering of dashboard HTML
 */

import type { CacheData, ProcessedContainer, FilterOptions } from './types';
import { filterContainers, getFilteredStacks, getUniqueEnvironments } from './utils';

/**
 * Render a single container card
 */
function renderCard(container: ProcessedContainer): string {
  const genericIconUrl = 'https://cdn.jsdelivr.net/gh/selfhst/icons/png/docker-dark.png';
  
  return `
    <div class="card" data-stack="${container.stack}" data-env="${container.environment.name}">
      <div class="card-header">
        <img 
          src="${escapeHtml(container.iconUrl)}" 
          alt="${escapeHtml(container.displayName)} icon" 
          class="card-icon"
          onerror="this.onerror=null; this.src='${genericIconUrl}';"
        />
        <h3 class="container-name">${escapeHtml(container.displayName)}</h3>
      </div>
      
      <div class="ports">
        ${container.ports
          .map(
            ({ port, url }) =>
              `<a href="${escapeHtml(url)}" target="_blank" class="port-badge" title="Open ${url}">${port}</a>`
          )
          .join('')}
      </div>
      
      <div class="card-labels">
        <span class="badge badge-stack">${escapeHtml(container.stack)}</span>
        <span class="badge badge-env">${escapeHtml(container.environment.name)}</span>
      </div>
    </div>
  `;
}

/**
 * Render the complete dashboard HTML
 */
export function renderDashboard(
  data: CacheData,
  filters: FilterOptions = {}
): string {
  const filtered = filterContainers(data.containers, filters);
  const stacks = getFilteredStacks(data.containers, filters.env);
  const environments = getUniqueEnvironments(data.containers);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dockhand Dashboard</title>
  <link rel="stylesheet" href="/style.css">
  <meta name="description" content="Fast dashboard for Dockhand container management">
</head>
<body>
  <header>
    <h1>🐳 Dockhand Dashboard</h1>
    
    <div class="filters">
      <input 
        type="text" 
        id="search" 
        placeholder="Search containers..." 
        value="${escapeHtml(filters.search || '')}"
      />
      
      <select id="stack-filter">
        <option value="">All Stacks</option>
        ${stacks
          .map(
            (stack) =>
              `<option value="${escapeHtml(stack)}" ${filters.stack === stack ? 'selected' : ''}>${escapeHtml(stack)}</option>`
          )
          .join('')}
      </select>
      
      <select id="env-filter">
        <option value="">All Environments</option>
        ${environments
          .map(
            (env) =>
              `<option value="${escapeHtml(env)}" ${filters.env === env ? 'selected' : ''}>${escapeHtml(env)}</option>`
          )
          .join('')}
      </select>
      
      <button id="refresh" title="Refresh page">↻ Refresh</button>
      <button id="reset-filters" title="Clear all filters">✕ Clear</button>
    </div>
    
    ${
      data.error
        ? `<div class="warning">⚠️ Last update failed: ${escapeHtml(data.error)}</div>`
        : ''
    }
    
    <p class="last-update">
      Last updated: ${data.lastUpdate.toLocaleString()} 
      <span class="container-count">(${filtered.length} container${filtered.length !== 1 ? 's' : ''})</span>
    </p>
  </header>
  
  <main class="container-grid">
    ${filtered.length > 0 ? filtered.map((c) => renderCard(c)).join('') : '<div class="empty-state"><p>No containers found</p><p class="empty-hint">Try adjusting your filters or start some containers in Dockhand</p></div>'}
  </main>
  
  <script src="/app.js"></script>
</body>
</html>`;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(str: string): string {
  const div = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return str.replace(/[&<>"']/g, (char) => div[char as keyof typeof div]);
}
