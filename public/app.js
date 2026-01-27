/**
 * Client-side JavaScript for Dockhand Dashboard
 * Handles filter interactions and page refresh
 */

(function () {
  'use strict';

  // Get filter elements
  const searchInput = document.getElementById('search');
  const stackFilter = document.getElementById('stack-filter');
  const envFilter = document.getElementById('env-filter');
  const refreshBtn = document.getElementById('refresh');
  const resetBtn = document.getElementById('reset-filters');

  /**
   * Build URL with filter query parameters
   */
  function buildFilterUrl() {
    const params = new URLSearchParams();

    const search = searchInput.value.trim();
    const stack = stackFilter.value;
    const env = envFilter.value;

    if (search) params.set('search', search);
    if (stack) params.set('stack', stack);
    if (env) params.set('env', env);

    const queryString = params.toString();
    return queryString ? `/?${queryString}` : '/';
  }

  /**
   * Apply filters by navigating to filtered URL
   */
  function applyFilters() {
    window.location.href = buildFilterUrl();
  }

  /**
   * Debounce function to limit how often a function is called
   */
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Event listeners
  if (searchInput) {
    // Debounce search input to avoid too many requests
    searchInput.addEventListener(
      'input',
      debounce(() => {
        applyFilters();
      }, 500)
    );

    // Also trigger on Enter key
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        applyFilters();
      }
    });
  }

  if (stackFilter) {
    stackFilter.addEventListener('change', applyFilters);
  }

  if (envFilter) {
    envFilter.addEventListener('change', applyFilters);
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      // Add loading class
      refreshBtn.classList.add('loading');
      
      // Refresh the page
      window.location.reload();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      // Navigate to home without any filters
      window.location.href = '/';
    });
  }

  /**
   * Update reset button state based on active filters
   */
  function updateResetButtonState() {
    if (!resetBtn) return;

    const hasActiveFilters =
      (searchInput && searchInput.value.trim()) ||
      (stackFilter && stackFilter.value) ||
      (envFilter && envFilter.value);

    resetBtn.disabled = !hasActiveFilters;
  }

  // Initialize reset button state on page load
  updateResetButtonState();

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + K to focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    }

    // F5 or Ctrl/Cmd + R for refresh (let browser handle it naturally)
    // Just adding the loading animation
    if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key === 'r')) {
      if (refreshBtn) {
        refreshBtn.classList.add('loading');
      }
    }
  });

  // Auto-focus search on page load (optional)
  // Uncomment if you want search auto-focused
  // if (searchInput && !searchInput.value) {
  //   searchInput.focus();
  // }
})();
