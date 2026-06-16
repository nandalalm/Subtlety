/**
 * @param {string} containerId 
 * @param {string} url 
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

            initializePagination(containerId);
            container.dispatchEvent(new CustomEvent('tableRefreshed', { detail: { containerId, url } }));
        }
    } catch (error) {
        console.error('Error refreshing table:', error);
    }
}

/**
 * @param {string} containerId
 */
function initializePagination(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const paginationLinks = container.querySelectorAll('.pagination-wrapper a, .pagination a');
    paginationLinks.forEach(link => {
        link.addEventListener('click', function (e) {
            const pageUrl = this.getAttribute('href');
            if (pageUrl && pageUrl !== 'javascript:void(0)' && pageUrl !== '#' && !this.classList.contains('disabled')) {
                e.preventDefault();
                refreshTable(containerId, pageUrl);
                window.history.pushState({}, '', pageUrl);
            }
        });
    });
}

/**
 * @param {string} formId 
 * @param {string} containerId
 */
function initializeAjaxSearch(formId, containerId) {
    const form = document.getElementById(formId);
    if (!form) return;

    form.addEventListener('submit', function (e) {
        e.preventDefault();

        const formData = new FormData(this);
        const searchParams = new URLSearchParams(formData);

        searchParams.set('page', '1');

        const action = this.getAttribute('action') || window.location.pathname;
        const newUrl = `${action}?${searchParams.toString()}`;

        refreshTable(containerId, newUrl);
        window.history.pushState({}, '', newUrl);
    });
}

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
 * @param {string} containerId 
 * @param {string} param
 * @param {string} value 
 * @param {string} basePath 
 */
function applyAjaxFilter(containerId, param, value, basePath = null) {
    const url = new URL(window.location.href);

    if (basePath) {
        const absolutePath = basePath.startsWith('/') ? basePath : `/${basePath}`;
        url.pathname = absolutePath;
    }

    if (value === '' || value === 'all') {
        url.searchParams.delete(param);
    } else {
        url.searchParams.set(param, value);
    }

    url.searchParams.set('page', '1');

    const newUrl = `${url.pathname}${url.search}`;

    refreshTable(containerId, newUrl);
    window.history.pushState({}, '', newUrl);
}

/**
 * @param {string} containerId 
 * @param {string} param 
 * @param {string} basePath 
 */
function clearAjaxFilter(containerId, param, basePath = null) {
    const url = new URL(window.location.href);

    if (basePath) {
        const absolutePath = basePath.startsWith('/') ? basePath : `/${basePath}`;
        url.pathname = absolutePath;
    }

    url.searchParams.delete(param);

    url.searchParams.set('page', '1');

    const newUrl = `${url.pathname}${url.search}`;

    refreshTable(containerId, newUrl);
    window.history.pushState({}, '', newUrl);
}

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
        'product-grid', 
        'wishlistContainer',
        'manage-address'
    ];

    standardContainers.forEach(id => {
        if (document.getElementById(id)) {
            initializePagination(id);
        }
    });

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
    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn && document.getElementById('product-grid-container')) {
        loadMoreBtn.addEventListener('click', function (e) {
        });
    }
});
