/**
 * HTML Template Renderer
 * Server-side rendering of dashboard HTML
 */

import type { CacheData, ProcessedContainer, FilterOptions } from './types';
import { getUniqueStacks, getUniqueEnvironments } from './utils';

/**
 * Render a single container card
 */
function renderCard(container: ProcessedContainer): string {
  const genericIconUrl = 'https://cdn.jsdelivr.net/gh/selfhst/icons/png/docker.png';
  const hasSinglePort = container.ports.length === 1;
  const primaryUrl = hasSinglePort ? (container.customUrl || container.ports[0].url) : '#';
  
  return `
    <div class="card" data-stack="${container.stack}" data-env="${container.environment.name}">
      <a href="/?stack=${encodeURIComponent(container.stack)}"
         class="stack-label"
         data-filter-type="stack"
         data-filter-value="${escapeHtml(container.stack)}"
         title="Filter by: ${escapeHtml(container.stack)}">
        ${escapeHtml(container.stack)}
      </a>
      
      <a href="/?env=${encodeURIComponent(container.environment.name)}" 
         class="ribbon ribbon-env"
         data-filter-type="env"
         data-filter-value="${escapeHtml(container.environment.name)}"
         data-env-name="${escapeHtml(container.environment.name)}"
         title="Filter by: ${escapeHtml(container.environment.name)}">
        ${escapeHtml(container.environment.name)}
      </a>
      
      <div class="card-header">
        <img 
          src="${escapeHtml(container.iconUrl)}" 
          alt="${escapeHtml(container.displayName)} icon" 
          class="card-icon"
          onerror="this.onerror=null; this.src='${genericIconUrl}';"
        />
        ${hasSinglePort 
          ? `<h3 class="container-name">
               <a href="${escapeHtml(primaryUrl)}" target="_blank" class="container-link">
                 ${escapeHtml(container.displayName)}
               </a>
             </h3>`
          : `<h3 class="container-name">${escapeHtml(container.displayName)}</h3>`
        }
      </div>
      
      ${!hasSinglePort ? `
        <div class="ports-list">
          ${container.ports
            .map(({ port, url }) => 
              `<a href="${escapeHtml(url)}" target="_blank" class="port-link">${port}</a>`
            )
            .join('<span class="port-separator">•</span>')}
        </div>
      ` : ''}
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
  // Sort containers by display name
  const allContainers = [...data.containers].sort((a, b) => 
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' })
  );
  const stacks = getUniqueStacks(allContainers);
  const environments = getUniqueEnvironments(allContainers);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dockhand Tavern</title>
  <link rel="stylesheet" href="/style.css">
  <meta name="description" content="Fast dashboard for Dockhand container management">
  <style>
    /* Hide cards on initial load if filters present (prevent flash) */
    body.has-filters .card { 
      opacity: 0; 
      max-height: 0;
      overflow: hidden;
    }
  </style>
</head>
<body>
  <header>
    <div class="header-top">
      <h1>🍺 Dockhand Tavern</h1>
      <button id="refresh" title="Refresh">↻</button>
    </div>
    
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
      
      <button id="reset-filters" title="Clear all filters">✕ Clear</button>
    </div>
    
    ${
      data.error
        ? `<div class="warning">⚠️ Last update failed: ${escapeHtml(data.error)}</div>`
        : ''
    }
    
    <p class="last-update">
      Last updated: ${data.lastUpdate.toLocaleString()} 
      <span class="container-count">(${allContainers.length} container${allContainers.length !== 1 ? 's' : ''})</span>
    </p>
  </header>
  
  <main class="container-grid">
    ${allContainers.map((c) => renderCard(c)).join('')}
    <div class="empty-state" style="display: none;">
      <p>No containers found</p>
      <p class="empty-hint">Try adjusting your filters or start some containers in Dockhand</p>
    </div>
  </main>
  
  <script src="/app.js"></script>
  <script>
    // Add class if URL has filters (prevents flash of all cards)
    if (window.location.search) {
      document.body.classList.add('has-filters');
    }
  </script>
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
