/**
 * Shared AJAX Table Logic for SUBTLETY
 * Handles pagination, search, sort, and filters without page reloads.
 */

/**
 * Refreshes the table content by fetching an HTML fragment from the server.
 * @param {string} containerId - The ID of the div containing the table partial.
 * @param {string} url - The URL to fetch (optional, defaults to current location).
 */
async function refreshTable(containerId, url = window.location.href) {
    try {
        const separator = url.includes('?') ? '&' : '?';
        const ajaxUrl = `${url}${separator}ajax=true`;

        const response = await (window.authAwareFetch ? window.authAwareFetch(ajaxUrl) : fetch(ajaxUrl));
        if (!response) return;
        if (!response.ok) throw new Error('Failed to fetch table contents');

        const html = await response.text();
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = html;

            // Re-initialize pagination listeners for the new content
            initializePagination(containerId);

            // Dispatch a custom event after refresh to allow page-specific re-initialization
            container.dispatchEvent(new CustomEvent('tableRefreshed', { detail: { containerId, url } }));
        }
    } catch (error) {
        console.error('Error refreshing table:', error);
        // Fallback to full page reload if AJAX fails? 
        // Window.location.href = url;
    }
}

/**
 * Attaches AJAX listeners to all pagination links within a container.
 * @param {string} containerId - The ID of the container with pagination.
 */
function initializePagination(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const paginationLinks = container.querySelectorAll('.pagination-wrapper a, .pagination a');
    paginationLinks.forEach(link => {
        link.addEventListener('click', function (e) {
            const pageUrl = this.getAttribute('href');
            // Ignore dead links, disabled links, and hash links
            if (pageUrl && pageUrl !== 'javascript:void(0)' && pageUrl !== '#' && !this.classList.contains('disabled')) {
                e.preventDefault();
                refreshTable(containerId, pageUrl);

                // Update browser URL without reload
                window.history.pushState({}, '', pageUrl);
            }
        });
    });
}

/**
 * Attaches AJAX listener to a search form.
 * @param {string} formId - The ID of the search <form>.
 * @param {string} containerId - The ID of the table container to refresh.
 */
function initializeAjaxSearch(formId, containerId) {
    const form = document.getElementById(formId);
    if (!form) return;

    form.addEventListener('submit', function (e) {
        e.preventDefault();

        const formData = new FormData(this);
        const searchParams = new URLSearchParams(formData);

        // Reset page to 1 on new search
        searchParams.set('page', '1');

        const action = this.getAttribute('action') || window.location.pathname;
        const newUrl = `${action}?${searchParams.toString()}`;

        refreshTable(containerId, newUrl);
        window.history.pushState({}, '', newUrl);
    });
}

/**
 * Called by the unified searchBar partial's search button.
 * Reads data attributes from the .unified-search wrapper.
 */
function unifiedSearchApply(btn) {
    const wrapper = btn.closest('.unified-search');
    const input = wrapper.querySelector('.unified-search-input');
    const clearBtn = wrapper.querySelector('.unified-search-clear');
    const containerId = wrapper.dataset.container;
    const param = wrapper.dataset.param || 'search';
    const basePath = wrapper.dataset.base || null;
    const val = input ? input.value.trim() : '';
    if (clearBtn) clearBtn.style.display = val ? 'flex' : 'none';
    applyAjaxFilter(containerId, param, val, basePath || null);
}

/**
 * Called by the unified searchBar partial's clear (×) button.
 */
function unifiedSearchClear(btn) {
    const wrapper = btn.closest('.unified-search');
    const input = wrapper.querySelector('.unified-search-input');
    const containerId = wrapper.dataset.container;
    const param = wrapper.dataset.param || 'search';
    const basePath = wrapper.dataset.base || null;
    if (input) input.value = '';
    btn.style.display = 'none';
    clearAjaxFilter(containerId, param, basePath || null);
}

/**
 * Programmatically applies a filter or sort and refreshes the table.
 * @param {string} containerId - The ID of the table container.
 * @param {string} param - The query parameter key (e.g., 'sort', 'status').
 * @param {string} value - The value to set.
 * @param {string} basePath - Optional custom base path for the fetch URL.
 */
function applyAjaxFilter(containerId, param, value, basePath = null) {
    const url = new URL(window.location.href);

    if (basePath) {
        // If a relative path is provided, ensure it starts with / for absolute resolution
        const absolutePath = basePath.startsWith('/') ? basePath : `/${basePath}`;
        url.pathname = absolutePath;
    }

    if (value === '' || value === 'all') {
        url.searchParams.delete(param);
    } else {
        url.searchParams.set(param, value);
    }

    // Reset page to 1 on new filter
    url.searchParams.set('page', '1');

    const newUrl = `${url.pathname}${url.search}`;

    refreshTable(containerId, newUrl);
    window.history.pushState({}, '', newUrl);
}

/**
 * Clears a specific query parameter and refreshes the table.
 * @param {string} containerId - The ID of the table container.
 * @param {string} param - The query parameter key to clear.
 * @param {string} basePath - Optional custom base path for the fetch URL.
 */
function clearAjaxFilter(containerId, param, basePath = null) {
    const url = new URL(window.location.href);

    if (basePath) {
        const absolutePath = basePath.startsWith('/') ? basePath : `/${basePath}`;
        url.pathname = absolutePath;
    }

    url.searchParams.delete(param);

    // Reset page to 1 when clearing filters
    url.searchParams.set('page', '1');

    const newUrl = `${url.pathname}${url.search}`;

    refreshTable(containerId, newUrl);
    window.history.pushState({}, '', newUrl);
}

// Automatically initialize pagination on page load for known containers
document.addEventListener('DOMContentLoaded', () => {
    const standardContainers = [
        'categoryTableContainer',
        'couponTableContainer',
        'offerTableContainer',
        'productTableContainer',
        'usersTableContainer',
        'reviewTableContainer',
        'orderTableContainer',
        'salesTableContainerParent',
        'userOrderContainer',
        'walletTableContainer',
        'product-grid', // For Shop Page
        'wishlistContainer',
        'manage-address'
    ];

    standardContainers.forEach(id => {
        if (document.getElementById(id)) {
            initializePagination(id);
        }
    });

    // If a search form exists with ID 'searchForm' or 'wallet-search-form', link it
    const searchForms = ['searchForm', 'wallet-search-form'];
    searchForms.forEach(formId => {
        const form = document.getElementById(formId);
        if (form) {
            const activeContainer = standardContainers.find(id => document.getElementById(id));
            if (activeContainer) {
                initializeAjaxSearch(formId, activeContainer);
            }
        }
    });

    // Special handling for Shop Page "Load More" button if it exists
    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn && document.getElementById('product-grid-container')) {
        loadMoreBtn.addEventListener('click', function (e) {
            // If the user wants FULL AJAX for shop pagination, we might need to 
            // translate this load-more into a standard numeric pagination or 
            // ensure the refreshTable handles appending. 
            // For now, we'll focus on the sort/filter being AJAX.
        });
    }
});
