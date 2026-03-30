document.addEventListener('DOMContentLoaded', () => {
  const getUserId = () => {
    const meta = document.querySelector('meta[name="user-id"]');
    return meta ? meta.getAttribute('content') : null;
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

  const syncProductAvailability = (productId, status) => {
    // Determine if we are on the single product page for this specific product
    const isSingleProductPage = window.location.pathname.includes(`/single-product/${productId}`);

    if (status === 'unlisted') {
      if (isSingleProductPage) {
        // On single product page: Show unavailable alert and hide controls
        const section = document.querySelector('.single-product-section .container');
        if (section) {
          section.innerHTML = `
            <div class="alert alert-warning mt-5" role="alert">
              The product you are looking for is currently unavailable.
            </div>
            <div class="text-center mt-3">
              <a href="/user/home" class="btn btn-dark">Back to Home</a>
            </div>`;
        }
      } else {
        // On other pages: Remove all card instances for this product
        const targets = document.querySelectorAll(`[data-product-id="${productId}"]`);
        targets.forEach(t => {
          const card = t.closest('.card-div');
          if (card) {
            card.style.transition = 'opacity 0.3s ease';
            card.style.opacity = '0';
            setTimeout(() => card.remove(), 300);
          }
        });
      }
    } else if (status === 'out-of-stock') {
      if (isSingleProductPage) {
        // Update single product UI to OOS
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
        // Update all grid cards to OOS state
        const containers = document.querySelectorAll(`[data-product-id="${productId}"]`);
        containers.forEach(container => {
           const card = container.closest('.card-div');
           if (card) {
               card.classList.add('out-of-stock');
               // Add label if not exists
               const imgContainer = card.querySelector('.card-img-half');
               if (imgContainer && !imgContainer.querySelector('.out-of-stock-label')) {
                   const label = document.createElement('span');
                   label.className = 'out-of-stock-label position-absolute';
                   label.style = 'top: 10px; right: 10px; background: rgba(255, 0, 0, 0.8); color: white; padding: 2px 8px; border-radius: 0; font-size: 10px; font-weight: bold;';
                   label.textContent = 'Out of Stock';
                   imgContainer.appendChild(label);
               }
               // Disable buttons
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

  const performUpdate = async (productId, newQty, currentQty) => {
    try {
      const result = await guardedJsonFetch('/cart/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, quantity: newQty })
      });
      if (!result) return;
      const { response: res, data } = result;
      if (res.ok) {
        if (data.newQuantity !== newQty) {
          showToast(data.message, 'warning');
          updateUI(productId, data.newQuantity);
        } else {
          showToast("Cart updated");
          // Ensure UI is in sync
          updateUI(productId, newQty);
        }
      } else {
        showToast(data.message, 'error');
        if (data.status === 'unlisted') {
          syncProductAvailability(productId, 'unlisted');
        } else if (data.status === 'out-of-stock') {
          syncProductAvailability(productId, 'out-of-stock');
        } else {
          updateUI(productId, currentQty);
        }
      }
    } catch (err) {
      console.error(err);
      showToast("Error updating cart", 'error');
      updateUI(productId, currentQty);
    }
  };

  document.addEventListener('click', async (e) => {
    const target = e.target.closest('button');
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
      window.location.href = '/auth/login';
      return;
    }

    // ADD TO CART
    if (target.classList.contains('btn-add-to-cart')) {
      e.preventDefault();
      target.blur();
      
      // Optimistic update
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
          updateUI(productId, data.newQuantity || 1);
        } else {
          showToast(data.message, 'error');
          // Rollback
          updateUI(productId, 0);
          if (data.status === 'unlisted') {
            syncProductAvailability(productId, 'unlisted');
          } else if (data.status === 'out-of-stock') {
            syncProductAvailability(productId, 'out-of-stock');
          }
        }
      } catch (err) {
        console.error(err);
        showToast("Something went wrong", 'error');
        // Rollback
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

      if (currentQty >= 10) {
        showToast("Maximum 10 items allowed", 'warning');
        return;
      }

      const newQty = currentQty + 1;
      // Optimistic update
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
      const display = target.closest('.cart-quantity-controls').querySelector('.quantity-display');
      const currentQty = parseInt(display.textContent);

      if (currentQty > 1) {
        const newQty = currentQty - 1;
        // Optimistic update
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
            updateUI(productId, 0);
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
                  card.remove();
                  if (document.querySelectorAll('.card-div').length === 0) {
                    location.reload();
                  }
                } else {
                  showToast("Removed from wishlist");
                }
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
                window.location.href = '/cart';
            } else {
                showToast(data.message, 'error');
                if (data.status === 'unlisted') {
                    syncProductAvailability(productId, 'unlisted');
                } else if (data.status === 'out-of-stock') {
                    syncProductAvailability(productId, 'out-of-stock');
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
