/**
 * Client-side JavaScript for Dockhand Dashboard
 * Handles filter interactions with client-side filtering
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
   * Generate consistent color for environment name using hash
   */
  function getEnvColor(envName) {
    const colors = [
      'blue', 'peach', 'yellow', 'green', 
      'red', 'teal', 'sky', 'pink'
    ];
    
    // Generate deterministic hash from environment name
    const hash = envName.split('').reduce((acc, char) => {
      return acc + char.charCodeAt(0);
    }, 0);
    
    return colors[hash % colors.length];
  }

  /**
   * Apply dynamic colors to environment ribbons
   */
  function applyEnvColors() {
    document.querySelectorAll('.ribbon-env').forEach(ribbon => {
      const envName = ribbon.dataset.envName;
      if (envName) {
        const color = getEnvColor(envName);
        ribbon.classList.add(`ribbon-env-color-${color}`);
      }
    });
  }

  /**
   * Update URL search params without reloading page
   */
  function updateUrlWithoutReload(filters) {
    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search);
    if (filters.stack) params.set('stack', filters.stack);
    if (filters.env) params.set('env', filters.env);
    
    const newUrl = params.toString() ? `/?${params.toString()}` : '/';
    window.history.pushState({}, '', newUrl);
  }

  /**
   * Update badge active states based on current filters
   */
  function updateBadgeStates() {
    const currentStack = stackFilter ? stackFilter.value : '';
    const currentEnv = envFilter ? envFilter.value : '';
    
    // Update all stack labels
    document.querySelectorAll('.stack-label').forEach(label => {
      const labelValue = label.dataset.filterValue;
      if (labelValue === currentStack) {
        label.classList.add('badge-active');
      } else {
        label.classList.remove('badge-active');
      }
    });
    
    // Update all env ribbons
    document.querySelectorAll('.ribbon-env').forEach(ribbon => {
      const ribbonValue = ribbon.dataset.filterValue;
      if (ribbonValue === currentEnv) {
        ribbon.classList.add('badge-active');
      } else {
        ribbon.classList.remove('badge-active');
      }
    });
  }

  /**
   * Apply filters by toggling card visibility (client-side)
   */
  function applyFiltersClientSide() {
    const search = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const stack = stackFilter ? stackFilter.value : '';
    const env = envFilter ? envFilter.value : '';
    
    const cards = document.querySelectorAll('.card');
    const emptyState = document.querySelector('.empty-state');
    let visibleCount = 0;
    
    cards.forEach(card => {
      const cardStack = card.dataset.stack;
      const cardEnv = card.dataset.env;
      const cardNameElement = card.querySelector('.container-name');
      const cardName = cardNameElement ? cardNameElement.textContent.toLowerCase() : '';
      
      // Determine if card should be visible
      let shouldShow = true;
      
      if (search && !cardName.includes(search)) {
        shouldShow = false;
      }
      
      if (stack && cardStack !== stack) {
        shouldShow = false;
      }
      
      if (env && cardEnv !== env) {
        shouldShow = false;
      }
      
      // Toggle visibility class
      if (shouldShow) {
        card.classList.remove('card-hidden');
        visibleCount++;
      } else {
        card.classList.add('card-hidden');
      }
    });
    
    // Show/hide empty state
    if (emptyState) {
      emptyState.style.display = visibleCount === 0 ? 'block' : 'none';
    }
    
    // Update URL without reload
    updateUrlWithoutReload({ search, stack, env });
    
    // Update badge states
    updateBadgeStates();
    
    // Update reset button state
    updateResetButtonState();
  }

  /**
   * Update stack dropdown based on selected environment
   */
  function updateStackDropdown() {
    if (!stackFilter) return;
    
    const selectedEnv = envFilter ? envFilter.value : '';
    const cards = document.querySelectorAll('.card');
    const availableStacks = new Set();
    
    // Find all stacks in selected environment
    cards.forEach(card => {
      if (!selectedEnv || card.dataset.env === selectedEnv) {
        availableStacks.add(card.dataset.stack);
      }
    });
    
    // Rebuild stack dropdown
    const currentStack = stackFilter.value;
    stackFilter.innerHTML = '<option value="">All Stacks</option>';
    
    Array.from(availableStacks).sort().forEach(stack => {
      const option = document.createElement('option');
      option.value = stack;
      option.textContent = stack;
      if (stack === currentStack) option.selected = true;
      stackFilter.appendChild(option);
    });
  }

  /**
   * Apply filters on page load from URL params
   */
  function applyInitialFilters() {
    const urlParams = new URLSearchParams(window.location.search);
    
    // Set filter values from URL
    if (searchInput) searchInput.value = urlParams.get('search') || '';
    if (stackFilter) stackFilter.value = urlParams.get('stack') || '';
    if (envFilter) envFilter.value = urlParams.get('env') || '';
    
    // Update stack dropdown based on env
    updateStackDropdown();
    
    // Apply filters if any exist
    if (urlParams.toString()) {
      // Remove has-filters class to show cards
      document.body.classList.remove('has-filters');
      applyFiltersClientSide();
    }
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
    // Debounce search input to avoid too many updates
    searchInput.addEventListener(
      'input',
      debounce(() => {
        applyFiltersClientSide();
      }, 500)
    );

    // Also trigger on Enter key
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        applyFiltersClientSide();
      }
    });
  }

  if (stackFilter) {
    stackFilter.addEventListener('change', applyFiltersClientSide);
  }

  if (envFilter) {
    envFilter.addEventListener('change', () => {
      updateStackDropdown();
      applyFiltersClientSide();
    });
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
      // Clear all filter inputs
      if (searchInput) searchInput.value = '';
      if (stackFilter) stackFilter.value = '';
      if (envFilter) envFilter.value = '';
      
      // Reset stack dropdown
      updateStackDropdown();
      
      // Apply filters (will show all)
      applyFiltersClientSide();
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

  /**
   * Handle ribbon and label clicks for toggling filters
   */
  function initBadgeFilters() {
    // Handle both ribbons and stack labels
    const filterElements = document.querySelectorAll('.ribbon[data-filter-type], .stack-label[data-filter-type]');
    
    filterElements.forEach(element => {
      element.addEventListener('click', (e) => {
        e.preventDefault();
        
        const filterType = element.dataset.filterType;
        const filterValue = element.dataset.filterValue;
        const isActive = element.classList.contains('badge-active');
        
        if (isActive) {
          // Remove this filter
          if (filterType === 'stack' && stackFilter) {
            stackFilter.value = '';
          } else if (filterType === 'env' && envFilter) {
            envFilter.value = '';
          }
        } else {
          // Apply this filter
          if (filterType === 'stack' && stackFilter) {
            stackFilter.value = filterValue;
          } else if (filterType === 'env' && envFilter) {
            envFilter.value = filterValue;
            updateStackDropdown();
          }
        }
        
        applyFiltersClientSide();
      });
    });
  }

  // Apply environment colors
  applyEnvColors();

  // Initialize badge filters
  initBadgeFilters();

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

  // Handle browser back/forward buttons
  window.addEventListener('popstate', () => {
    applyInitialFilters();
  });

  // Apply initial filters on page load
  applyInitialFilters();
})();
