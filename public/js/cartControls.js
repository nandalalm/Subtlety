if (!window.__subtletyCartControlsInitialized) {
  window.__subtletyCartControlsInitialized = true;

document.addEventListener('DOMContentLoaded', () => {
  const getUserId = () => {
    const meta = document.querySelector('meta[name="user-id"]');
    return meta ? meta.getAttribute('content') : null;
  };

  const getLoginRedirectUrl = () => {
    const currentPath = `${window.location.pathname}${window.location.search}`;
    const isShopPage = window.location.pathname === '/user/shop';
    const isSingleProductPage = Boolean(document.querySelector('.single-product-section'));

    if (isShopPage || isSingleProductPage) {
      return `/auth/login?returnTo=${encodeURIComponent(currentPath)}`;
    }

    return '/auth/login';
  };

  const showToast = (message, type = 'success') => {
    let bgColor = "linear-gradient(to right, #3097ff, #4d64f9)"; // Default success
    if (type === 'error') bgColor = "linear-gradient(to right, #ff416c, #ff4b2b)";
    if (type === 'warning') bgColor = "linear-gradient(to right, #ff9800, #ffc371)";

    Toastify({
      text: message,
      duration: 3000,
      gravity: "bottom",
      position: "center",
      style: {
        background: bgColor
      }
    }).showToast();
  };

  const guardedJsonFetch = async (url, options) => {
    const response = await window.authAwareFetch(url, options);
    if (!response) return null;
    const data = await response.json();
    return { response, data };
  };

  const getVisibleProductIds = (grid) => {
    return Array.from(grid.querySelectorAll('.card-div .cart-controls-container[data-product-id]'))
      .map((element) => element.getAttribute('data-product-id'))
      .filter(Boolean);
  };

  const getProductCards = (productId) => Array.from(document.querySelectorAll(`.card-div[data-product-id="${productId}"]`));

  const getCategoryCards = (categoryId) => {
    if (!categoryId) return [];
    return Array.from(document.querySelectorAll(`.card-div[data-category-id="${categoryId}"]`));
  };

  const getCategoryIdForProduct = (productId) => {
    const productCard = document.querySelector(`.card-div[data-product-id="${productId}"]`);
    if (productCard?.dataset.categoryId) return productCard.dataset.categoryId;

    const controls = document.querySelector(`.cart-controls-container[data-product-id="${productId}"]`);
    if (controls?.dataset.categoryId) return controls.dataset.categoryId;

    const cardLink = document.querySelector(`.card-link[data-product-id="${productId}"]`);
    return cardLink?.dataset.categoryId || null;
  };

  const getSingleProductPageContext = () => {
    const section = document.querySelector('.single-product-section');
    if (!section) return null;

    return {
      section,
      container: section.querySelector('.container'),
      productId: section.dataset.productId || null,
      categoryId: section.dataset.categoryId || null,
      relatedSection: document.querySelector('.related-products')
    };
  };

  const renderSingleProductUnavailableState = ({ container, relatedSection, message, removeRelatedSection = false }) => {
    if (container) {
      container.innerHTML = `
        <div class="single-product-state">
          <div class="single-product-state-card">
            <div>
              <div class="mb-3">
                <i class="fas fa-box-open" style="font-size: 2.6rem; color: #9135ED;"></i>
              </div>
              <h3 class="font-weight-bold mb-2">Product Unavailable</h3>
              <p class="text-muted mb-4">${message}</p>
              <a href="/user/home" class="btn btn-dark px-4">Back to Home</a>
            </div>
          </div>
        </div>`;
    }

    if (removeRelatedSection && relatedSection) {
      relatedSection.remove();
    }
  };

  const auditSingleProductPageAvailability = async () => {
    const singleProductContext = getSingleProductPageContext();
    if (!singleProductContext) return;

    const currentProductId = singleProductContext.productId;
    if (currentProductId) {
      const mainAvailability = await requestProductAvailability(currentProductId);
      if (mainAvailability?.status === 'category-unlisted') {
        await syncProductAvailability(currentProductId, 'category-unlisted', { categoryId: mainAvailability.categoryId });
        return;
      }
      if (mainAvailability?.status === 'unlisted') {
        await syncProductAvailability(currentProductId, 'unlisted', { categoryId: mainAvailability.categoryId });
      }
    }

    const relatedGrid = document.getElementById('related-product-grid');
    if (!relatedGrid) return;

    const relatedProductIds = getVisibleProductIds(relatedGrid);
    for (const relatedProductId of relatedProductIds) {
      const availability = await requestProductAvailability(relatedProductId);
      if (!availability) continue;

      if (availability.status === 'category-unlisted') {
        await syncProductAvailability(relatedProductId, 'category-unlisted', { categoryId: availability.categoryId });
        return;
      }

      if (availability.status === 'unlisted') {
        await syncProductAvailability(relatedProductId, 'unlisted', { categoryId: availability.categoryId });
      }
    }
  };

  const requestReplacementCard = async (grid, section, extraParams = {}) => {
    const params = new URLSearchParams({
      section,
      exclude: getVisibleProductIds(grid).join(',')
    });

    Object.entries(extraParams).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });

    const response = await window.authAwareFetch(`/user/section-product/replacement?${params.toString()}`);
    if (!response) return null;
    const data = await response.json();
    if (!response.ok || !data.success || !data.html) return null;
    return data;
  };

  const requestProductAvailability = async (productId) => {
    const response = await window.authAwareFetch(`/user/product-availability/${productId}`);
    if (!response) return null;
    const data = await response.json();
    if (!response.ok) return null;
    return data;
  };

  const refillGridIfPossible = async (gridContext, slotsToFill = 1) => {
    if (!gridContext) return;

    const wishlistGrid = gridContext.closest ? gridContext.closest('#wishlist-grid') : null;
    if (wishlistGrid && typeof window.refreshTable === 'function') {
      await window.refreshTable('wishlistContainer');
      return;
    }

    const relatedGrid = gridContext.id === 'related-product-grid' ? gridContext : gridContext.closest?.('#related-product-grid');
    if (relatedGrid) {
      for (let index = 0; index < slotsToFill; index += 1) {
        const replacement = await requestReplacementCard(relatedGrid, 'related', {
          productId: relatedGrid.dataset.productId,
          categoryId: relatedGrid.dataset.categoryId
        });
        if (!replacement) break;
        relatedGrid.insertAdjacentHTML('beforeend', replacement.html);
      }
      return;
    }

    const latestGrid = gridContext.id === 'latest-products-grid' ? gridContext : gridContext.closest?.('#latest-products-grid');
    if (latestGrid) {
      for (let index = 0; index < slotsToFill; index += 1) {
        const replacement = await requestReplacementCard(latestGrid, 'latest');
        if (!replacement) break;
        latestGrid.insertAdjacentHTML('beforeend', replacement.html);
      }
      return;
    }

    const bestSellingGrid = gridContext.id === 'best-selling-grid' ? gridContext : gridContext.closest?.('#best-selling-grid');
    if (bestSellingGrid) {
      for (let index = 0; index < slotsToFill; index += 1) {
        const replacement = await requestReplacementCard(bestSellingGrid, 'best-selling');
        if (!replacement) break;
        bestSellingGrid.insertAdjacentHTML('beforeend', replacement.html);
      }
    }
  };

  const removeCardsAndRefill = async (cards) => {
    const uniqueCards = [...new Set(cards.filter(Boolean))];
    if (!uniqueCards.length) return;

    const refillCounts = new Map();
    uniqueCards.forEach((card) => {
      const parentGrid = card.parentElement;
      if (!parentGrid) return;
      refillCounts.set(parentGrid, (refillCounts.get(parentGrid) || 0) + 1);
    });

    uniqueCards.forEach((card) => {
      card.style.transition = 'opacity 0.3s ease';
      card.style.opacity = '0';
    });

    await new Promise((resolve) => setTimeout(resolve, 300));
    uniqueCards.forEach((card) => card.remove());

    for (const [gridContext, slotsToFill] of refillCounts.entries()) {
      await refillGridIfPossible(gridContext, slotsToFill);
    }
  };

  const removeProductCards = async (productId) => {
    await removeCardsAndRefill(getProductCards(productId));
  };

  const removeCategoryCards = async (categoryId) => {
    await removeCardsAndRefill(getCategoryCards(categoryId));
  };

  const syncProductAvailability = async (productId, status, options = {}) => {
    const singleProductContext = getSingleProductPageContext();
    const isSingleProductPage = Boolean(singleProductContext);
    const affectedCategoryId = options.categoryId || getCategoryIdForProduct(productId);
    const isCurrentViewedProduct = Boolean(
      singleProductContext?.productId && String(singleProductContext.productId) === String(productId)
    );
    const isCurrentViewedCategory = Boolean(
      singleProductContext?.categoryId && affectedCategoryId && String(singleProductContext.categoryId) === String(affectedCategoryId)
    );

    if (status === 'unlisted' || status === 'category-unlisted') {
      if (isSingleProductPage && (isCurrentViewedProduct || (status === 'category-unlisted' && isCurrentViewedCategory))) {
        renderSingleProductUnavailableState({
          container: singleProductContext.container,
          relatedSection: singleProductContext.relatedSection,
          removeRelatedSection: status === 'category-unlisted',
          message: status === 'category-unlisted'
            ? 'This product category is currently unavailable, so this item and its related products can no longer be shown.'
            : 'The product you were looking for is no longer available.'
        });
      } else {
        if (status === 'category-unlisted' && affectedCategoryId) {
          await removeCategoryCards(affectedCategoryId);
        } else {
          await removeProductCards(productId);
        }
      }
    } else if (status === 'out-of-stock') {
      setQuantityControlState(productId, 'out-of-stock', 0);
      if (isSingleProductPage) {
        const stockStatus = document.querySelector('.in-stock');
        if (stockStatus) {
          stockStatus.classList.remove('in-stock');
          stockStatus.classList.add('text-danger');
          stockStatus.textContent = 'Out of Stock';
        }
        const buyNowBtn = document.querySelector('.buy-buy');
        if (buyNowBtn) buyNowBtn.classList.add('disabled');
        const addToCartBtn = document.querySelector('.btn-add-to-cart');
        if (addToCartBtn) addToCartBtn.classList.add('disabled');
      } else {
        const containers = document.querySelectorAll(`[data-product-id="${productId}"]`);
        containers.forEach((container) => {
          const card = container.closest('.card-div');
          if (card) {
            card.classList.add('out-of-stock');
            const imgContainer = card.querySelector('.card-img-half');
            if (imgContainer && !imgContainer.querySelector('.out-of-stock-label')) {
              const label = document.createElement('span');
              label.className = 'out-of-stock-label position-absolute';
              label.style = 'top: 10px; right: 10px; background: rgba(255, 0, 0, 0.8); color: white; padding: 2px 8px; border-radius: 0; font-size: 10px; font-weight: bold;';
              label.textContent = 'Out of Stock';
              imgContainer.appendChild(label);
            }
            const addBtn = card.querySelector('.btn-add-to-cart');
            if (addBtn) addBtn.classList.add('disabled');
          }
        });
      }
    }
  };

  const updateUI = (productId, quantity) => {
      const containers = document.querySelectorAll(`.cart-controls-container[data-product-id="${productId}"]`);
    containers.forEach(container => {
      const isSpLayout = container.dataset.spLayout === 'true';
      const isInBtnGroup = container.classList.contains('btn-group');

      // Find existing cart-related element to replace
      const existingCartBtn = container.querySelector('.btn-add-to-cart');
      const existingQuantityControls = container.querySelector('.cart-quantity-controls');
      const targetElement = existingCartBtn || existingQuantityControls;

      let newCartHtml;
      if (quantity > 0) {
        if (isSpLayout) {
          newCartHtml = `
            <div class="cart-quantity-controls d-flex align-items-center" style="height: 42px; width: 170px;">
              <div class="d-flex align-items-center btn btn-dark p-0 h-100 w-100" style="border-radius: 8px; overflow: hidden;">
                <button type="button" class="btn btn-dark btn-decrement m-0 border-0 h-100" data-product-id="${productId}" style="border-radius: 0; border-right: 1px solid rgba(255,255,255,0.3); min-width: 40px;">−</button>
                <span class="quantity-display flex-grow-1 text-center font-weight-bold" style="font-size: 1rem; color: #fff; min-width: 40px;">${quantity}</span>
                <button type="button" class="btn btn-dark btn-increment m-0 border-0 h-100" data-product-id="${productId}" style="border-radius: 0; border-left: 1px solid rgba(255,255,255,0.3); min-width: 40px;">+</button>
              </div>
            </div>`;
        } else {
          newCartHtml = `
            <div class="cart-quantity-controls d-flex align-items-center flex-grow-1" style="height: 100%;">
              <div class="d-flex align-items-center w-100" style="height: 100%; border-radius: 0; overflow: hidden; background: #212529;">
                <button type="button" class="btn btn-dark btn-decrement m-0 border-0 h-100" data-product-id="${productId}" style="border-radius: 0; border-right: 1px solid rgba(255,255,255,0.3); min-width: 40px;">−</button>
                <span class="quantity-display flex-grow-1 text-center" style="font-weight: bold; color: #fff;">${quantity}</span>
                <button type="button" class="btn btn-dark btn-increment m-0 border-0 h-100" data-product-id="${productId}" style="border-radius: 0; border-left: 1px solid rgba(255,255,255,0.3); min-width: 40px;">+</button>
              </div>
            </div>`;
        }
      } else {
        if (isSpLayout) {
          newCartHtml = `
            <button class="btn btn-dark btn-add-to-cart font-weight-bold" data-product-id="${productId}" style="height: 42px; border-radius: 8px; width: 170px;">
              <i class="fas fa-shopping-cart mr-1"></i> Add To Cart
            </button>`;
        } else if (isInBtnGroup) {
          newCartHtml = `
            <button type="button" class="btn btn-dark m-0 btn-add-to-cart flex-grow-1 rounded-0" data-product-id="${productId}" style="height: 100%; border-radius: 0 !important; font-size: 0.85rem;">
              <i class="fas fa-shopping-cart mr-1"></i> Add to Cart
            </button>`;
        } else {
          newCartHtml = `
            <button type="button" class="btn btn-dark m-0 btn-add-to-cart w-100 h-100 rounded-0" data-product-id="${productId}" style="height: 100%; border-radius: 0 !important; font-size: 0.85rem;">
              <i class="fas fa-shopping-cart small mr-1"></i> Add to Cart
            </button>`;
        }
      }

      if (targetElement) {
        targetElement.outerHTML = newCartHtml;
      } else {
        // Fallback: prepend to container (should not happen if initial EJS is correct)
        container.insertAdjacentHTML('afterbegin', newCartHtml);
      }
    });
  };

  const debounceTimers = {};
  const desiredQuantities = {};
  const latestRequestIds = {};
  const quantityControlStates = {};
  let requestSequence = 0;

  const setDesiredQuantity = (productId, quantity) => {
    desiredQuantities[productId] = quantity;
  };

  const getQuantityControlState = (productId) => quantityControlStates[productId] || { state: 'default', availableStock: null };

  const getKnownAvailableStock = (productId) => {
    const quantityState = getQuantityControlState(productId);
    if (Number.isFinite(quantityState.availableStock)) return quantityState.availableStock;

    const container = document.querySelector(`.cart-controls-container[data-product-id="${productId}"]`);
    if (!container) return null;

    const stockValue = Number(container.dataset.stock);
    return Number.isFinite(stockValue) ? stockValue : null;
  };

  const getEffectiveMaxQuantity = (productId) => {
    const availableStock = getKnownAvailableStock(productId);
    if (!Number.isFinite(availableStock)) return 10;
    return Math.max(0, Math.min(10, availableStock));
  };

  const setQuantityControlState = (productId, state = 'default', availableStock = null) => {
    if (!productId) return;
    if (state === 'default') delete quantityControlStates[productId];
    else quantityControlStates[productId] = { state, availableStock };

    if (Number.isFinite(availableStock)) {
      document.querySelectorAll(`.cart-controls-container[data-product-id="${productId}"]`).forEach((container) => {
        container.dataset.stock = String(availableStock);
      });
    }

    document.querySelectorAll(`.cart-controls-container[data-product-id="${productId}"] .cart-quantity-controls`).forEach((controls) => {
      const incrementButton = controls.querySelector('.btn-increment');
      const decrementButton = controls.querySelector('.btn-decrement');

      if (incrementButton) incrementButton.disabled = false;
      if (decrementButton) decrementButton.disabled = false;
    });
  };

  const performUpdate = async (productId, newQty, currentQty) => {
    const requestId = ++requestSequence;
    latestRequestIds[productId] = requestId;

    try {
      const result = await guardedJsonFetch('/cart/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, quantity: newQty })
      });
      if (!result) return;
      const { response: res, data } = result;
      if (requestId !== latestRequestIds[productId]) return;
      if (desiredQuantities[productId] !== newQty) return;

      if (res.ok) {
        if (data.stock === 0) {
          setQuantityControlState(productId, 'out-of-stock', 0);
        } else if (data.stock > 0 && data.newQuantity >= data.stock) {
          setQuantityControlState(productId, 'low-stock', data.stock);
        } else {
          setQuantityControlState(productId, 'default');
        }

        if (data.newQuantity !== newQty) {
          showToast(data.message, 'warning');
          setDesiredQuantity(productId, data.newQuantity);
          updateUI(productId, data.newQuantity);
        } else {
          showToast("Cart updated");
        }
        await auditSingleProductPageAvailability();
      } else {
        showToast(data.message, 'error');
        if (data.status === 'unlisted' || data.status === 'category-unlisted') {
          await syncProductAvailability(productId, data.status);
          await auditSingleProductPageAvailability();
        } else if (data.status === 'out-of-stock') {
          setQuantityControlState(productId, 'out-of-stock', data.availableStock ?? 0);
          setDesiredQuantity(productId, currentQty);
          updateUI(productId, currentQty);
          await syncProductAvailability(productId, 'out-of-stock');
        } else if (data.status === 'low-stock') {
          const fallbackQuantity = Math.max(1, Math.min(currentQty, data.availableStock ?? currentQty));
          setQuantityControlState(productId, 'low-stock', data.availableStock);
          setDesiredQuantity(productId, fallbackQuantity);
          updateUI(productId, fallbackQuantity);
        } else {
          setQuantityControlState(productId, 'default');
          setDesiredQuantity(productId, currentQty);
          updateUI(productId, currentQty);
        }
      }
    } catch (err) {
      if (requestId !== latestRequestIds[productId]) return;
      if (desiredQuantities[productId] !== newQty) return;
      console.error(err);
      showToast("Error updating cart", 'error');
      setQuantityControlState(productId, 'default');
      setDesiredQuantity(productId, currentQty);
      updateUI(productId, currentQty);
    }
  };

  document.addEventListener('click', async (e) => {
    const cardLink = e.target.closest('a.card-link[data-product-id]');
    const nestedButton = e.target.closest('button');
    if (cardLink && !nestedButton && !e.defaultPrevented) {
      const isModifiedClick = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
      if (!isModifiedClick && !cardLink.hasAttribute('target')) {
        const linkedProductId = cardLink.getAttribute('data-product-id');
        if (linkedProductId) {
          e.preventDefault();
          try {
            const availability = await requestProductAvailability(linkedProductId);
            await auditSingleProductPageAvailability();
            if (!availability || availability.status === 'available' || availability.status === 'out-of-stock') {
              window.location.href = cardLink.href;
              return;
            }

            const toastMessage = availability.status === 'category-unlisted'
              ? "This product's category is no longer available"
              : 'This product is no longer available';
            showToast(toastMessage, 'error');
            await syncProductAvailability(linkedProductId, availability.status, { categoryId: availability.categoryId });
            await auditSingleProductPageAvailability();
            return;
          } catch (err) {
            console.error(err);
            window.location.href = cardLink.href;
            return;
          }
        }
      }
    }

    const target = nestedButton;
    if (!target) return;

    const productId = target.getAttribute('data-product-id');
    const userId = getUserId();

    if (!productId) return;

    // AUTH CHECK
    if (!userId && (target.classList.contains('btn-add-to-cart') ||
      target.classList.contains('btn-increment') ||
      target.classList.contains('btn-decrement') ||
      target.classList.contains('btn-add-to-wishlist') ||
      target.classList.contains('buy-buy'))) {
      window.location.href = getLoginRedirectUrl();
      return;
    }

    // ADD TO CART
    if (target.classList.contains('btn-add-to-cart')) {
      e.preventDefault();
      target.blur();
      
      // Optimistic update
      setDesiredQuantity(productId, 1);
      updateUI(productId, 1);
      
      try {
        const result = await guardedJsonFetch('/cart/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: userId, productId, quantity: 1 })
        });
        if (!result) return;
        const { response: res, data } = result;
        if (res.ok) {
          showToast(data.message);
          // Sync with potentially different quantity (e.g. if already in cart)
          setQuantityControlState(productId, 'default');
          setDesiredQuantity(productId, data.newQuantity || 1);
          updateUI(productId, data.newQuantity || 1);
          await auditSingleProductPageAvailability();
        } else {
          showToast(data.message, 'error');
          // Rollback
          setDesiredQuantity(productId, 0);
          updateUI(productId, 0);
          if (data.status === 'unlisted' || data.status === 'category-unlisted') {
            await syncProductAvailability(productId, data.status);
            await auditSingleProductPageAvailability();
          } else if (data.status === 'out-of-stock') {
            await syncProductAvailability(productId, 'out-of-stock');
          }
        }
      } catch (err) {
        console.error(err);
        showToast("Something went wrong", 'error');
        // Rollback
        setDesiredQuantity(productId, 0);
        updateUI(productId, 0);
      }
    }

  // syncProductAvailability moved to top scope

    // INCREMENT
    if (target.classList.contains('btn-increment')) {
      e.preventDefault();
      target.blur();
      const controls = target.closest('.cart-quantity-controls');
      if (!controls) return;
      const display = controls.querySelector('.quantity-display');
      const currentQty = parseInt(display.textContent);
      const quantityState = getQuantityControlState(productId);

      if (quantityState.state === 'out-of-stock' || quantityState.availableStock === 0) {
        showToast("Product out of stock", 'warning');
        return;
      }

      const effectiveMaxQuantity = getEffectiveMaxQuantity(productId);
      if (effectiveMaxQuantity <= 0) {
        showToast("Product out of stock", 'warning');
        return;
      }

      if (currentQty >= effectiveMaxQuantity) {
        if (effectiveMaxQuantity < 10) {
          setQuantityControlState(productId, 'low-stock', effectiveMaxQuantity);
          showToast(`Only ${effectiveMaxQuantity} items left in stock`, 'warning');
        } else {
          showToast("Maximum 10 items allowed", 'warning');
        }
        return;
      }

      const newQty = currentQty + 1;
      // Optimistic update
      setDesiredQuantity(productId, newQty);
      updateUI(productId, newQty);

      // Debounce the API call
      clearTimeout(debounceTimers[productId]);
      debounceTimers[productId] = setTimeout(() => {
        performUpdate(productId, newQty, currentQty);
      }, 500);
    }

    // DECREMENT
    if (target.classList.contains('btn-decrement')) {
      e.preventDefault();
      target.blur();
      if (target.disabled) return;
      const display = target.closest('.cart-quantity-controls').querySelector('.quantity-display');
      const currentQty = parseInt(display.textContent);

      if (currentQty > 1) {
        const newQty = currentQty - 1;
        // Optimistic update
        setDesiredQuantity(productId, newQty);
        updateUI(productId, newQty);

        // Debounce the API call
        clearTimeout(debounceTimers[productId]);
        debounceTimers[productId] = setTimeout(() => {
          performUpdate(productId, newQty, currentQty);
        }, 500);
      } else {
        // REMOVE FROM CART - Instant removal
        clearTimeout(debounceTimers[productId]); // Clear any pending update for this product
        try {
          const result = await guardedJsonFetch('/cart/remove', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId })
          });
          if (!result) return;
          const { response: res, data } = result;
          if (res.ok) {
            showToast("Item removed from cart");
            setQuantityControlState(productId, 'default');
            setDesiredQuantity(productId, 0);
            updateUI(productId, 0);
            await auditSingleProductPageAvailability();
          } else {
            showToast(data.message, 'error');
          }
        } catch (err) {
          console.error(err);
          showToast("Error removing item", 'error');
        }
      }
    }

    // WISHLIST ADD
    if (target.classList.contains('btn-add-to-wishlist')) {
      e.preventDefault();
      target.blur();
      try {
        const response = await window.authAwareFetch('/wishlist/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId })
        });
        if (!response) return;
        
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
          const data = await response.json();
          showToast(data.message, response.ok ? 'success' : 'error');
          if (!response.ok && (data.status === 'unlisted' || data.status === 'category-unlisted')) {
            await syncProductAvailability(productId, data.status);
            await auditSingleProductPageAvailability();
          } else if (response.ok) {
            await auditSingleProductPageAvailability();
          }
        } else {
          showToast("Something went wrong", 'error');
        }
      } catch (err) {
        console.error(err);
        showToast("Error adding to wishlist", 'error');
      }
    }

    // WISHLIST REMOVE
    if (target.classList.contains('btn-remove-from-wishlist')) {
      e.preventDefault();
      target.blur();
      SwalCustom.confirm(
        'Are you sure?',
        "You want to remove this product from your wishlist!",
        'Yes, remove it!',
        'Cancel'
      ).then(async (result) => {
        if (result.isConfirmed) {
          try {
            const response = await window.authAwareFetch(`/wishlist/remove/${productId}`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId })
            });
            if (!response) return;

            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
              const data = await response.json();
              if (response.ok) {
                const card = target.closest('.card-div');
                if (card) {
                  const parentGrid = card.parentElement;
                  card.style.transition = 'opacity 0.3s ease';
                  card.style.opacity = '0';
                  await new Promise((resolve) => setTimeout(resolve, 250));
                  card.remove();
                  await refillGridIfPossible(parentGrid);
                } else {
                  showToast("Removed from wishlist");
                }
                showToast(data.message || "Removed from wishlist");
              } else {
                showToast(data.message, 'error');
              }
            } else {
              showToast("Something went wrong", 'error');
            }
          } catch (err) {
            console.error(err);
          }
        }
      });
    }

    // BUY NOW (Specific to single product page)
    if (target.classList.contains('buy-buy')) {
        e.preventDefault();
        target.blur();

        // If product already in cart, just go to cart
        const cartControls = target.parentElement?.querySelector('.cart-action-wrapper');
        const isAlreadyInCart = cartControls?.querySelector('.cart-quantity-controls');
        
        if (isAlreadyInCart) {
            window.location.href = '/cart';
            return;
        }

        try {
            const result = await guardedJsonFetch('/cart/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user: userId, productId, quantity: 1 })
            });
            if (!result) return;
            const { response: res, data } = result;
            if (res.ok) {
                await auditSingleProductPageAvailability();
                window.location.href = '/cart';
            } else {
                showToast(data.message, 'error');
                if (data.status === 'unlisted' || data.status === 'category-unlisted') {
                    await syncProductAvailability(productId, data.status);
                    await auditSingleProductPageAvailability();
                } else if (data.status === 'out-of-stock') {
                    await syncProductAvailability(productId, 'out-of-stock');
                }
            }
        } catch (err) {
            console.error(err);
            if (!(err instanceof ReferenceError)) {
                showToast("Something went wrong", 'error');
            }
        }
    }
  });
});
}
