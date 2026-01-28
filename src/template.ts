/**
 * HTML Template Renderer
 * Server-side rendering of dashboard HTML
 */

import type { CacheData, ProcessedContainer, FilterOptions } from './types';
import { getUniqueGroups, getUniqueEnvironments } from './utils';

/**
 * Render containers grouped by their group field
 * Groups are created dynamically based on actual data
 * Groups sorted alphabetically, "ungrouped" last
 * Containers within groups sorted by displayName
 */
function renderGroupedContainers(containers: ProcessedContainer[]): string {
  // Group containers by their group field
  const grouped = new Map<string, ProcessedContainer[]>();
  
  containers.forEach(container => {
    const group = container.group;
    if (!grouped.has(group)) {
      grouped.set(group, []);
    }
    grouped.get(group)!.push(container);
  });
  
  // Sort groups alphabetically, "ungrouped" last
  const sortedGroups = Array.from(grouped.keys()).sort((a, b) => {
    if (a === 'ungrouped') return 1;
    if (b === 'ungrouped') return -1;
    return a.localeCompare(b);
  });
  
  // Render each group section
  return sortedGroups.map(groupName => {
    const groupContainers = grouped.get(groupName)!;
    
    // Sort containers within group by displayName
    const sortedContainers = groupContainers.sort((a, b) => 
      a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' })
    );
    
    return `
      <div class="container-group" data-group-name="${escapeHtml(groupName)}">
        <h2 class="group-header">${escapeHtml(groupName)}</h2>
        <div class="container-grid">
          ${sortedContainers.map(c => renderCard(c)).join('')}
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Render a single container card
 */
function renderCard(container: ProcessedContainer): string {
  const genericIconUrl = 'https://cdn.jsdelivr.net/gh/selfhst/icons/png/docker.png';
  
  return `
    <div class="card" data-group="${container.group}" data-env="${container.environment.name}">
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
        <h3 class="container-name">
          <a href="${escapeHtml(container.url)}" target="_blank" class="container-link">
            ${escapeHtml(container.displayName)}
          </a>
        </h3>
      </div>
    </div>
  `;
}

/**
 * Render the complete dashboard HTML
 */
export function renderDashboard(
  data: CacheData,
  filters: FilterOptions = {},
  dockhandUrl?: string
): string {
  const allContainers = [...data.containers];
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
      <div class="title-group">
        <h1>🍺 Dockhand Tavern</h1>
        ${dockhandUrl ? `<a href="${escapeHtml(dockhandUrl)}" target="_blank" class="dockhand-link" title="Open Dockhand">${escapeHtml(new URL(dockhandUrl).host)}</a>` : ''}
      </div>
      <button id="refresh" title="Refresh">↻</button>
    </div>
    
    <div class="filters">
      <input 
        type="text" 
        id="search" 
        placeholder="Search containers..." 
        value="${escapeHtml(filters.search || '')}"
      />
      
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
  
  <main>
    ${renderGroupedContainers(allContainers)}
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
