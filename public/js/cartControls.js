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
      const cartBtn = container.querySelector('.btn-add-to-cart');
      const quantityControls = container.querySelector('.cart-quantity-controls');

      // Detect layout context:
      // 1. Single product page (data-sp-layout) → replace entire container innerHTML
      // 2. Product card (cart-controls-container IS btn-group) → flex-grow-1
      // 3. Wishlist card (w-75 fixed-width div) → w-100 h-100
      const isSpLayout = container.dataset.spLayout === 'true';
      const isInBtnGroup = container.classList.contains('btn-group');

      // --- Single Product Page: replace full container content ---
      if (isSpLayout) {
        if (quantity > 0) {
          container.innerHTML = `
            <div class="cart-quantity-controls d-flex align-items-center">
              <div class="d-flex align-items-center btn btn-dark p-0" style="border-radius: 6px; overflow: hidden;">
                <button type="button" class="btn btn-dark btn-decrement m-0 border-0" data-product-id="${productId}" style="border-radius: 0; border-right: 1px solid rgba(255,255,255,0.3); min-width: 36px;">−</button>
                <span class="quantity-display px-3" style="font-weight: bold; font-size: 1rem; color: #fff; min-width: 36px; text-align: center;">${quantity}</span>
                <button type="button" class="btn btn-dark btn-increment m-0 border-0" data-product-id="${productId}" style="border-radius: 0; border-left: 1px solid rgba(255,255,255,0.3); min-width: 36px;">+</button>
              </div>
            </div>`;
        } else {
          container.innerHTML = `
            <button class="btn btn-dark btn-add-to-cart" data-product-id="${productId}">
              <i class="fas fa-shopping-cart"></i> Add To Cart
            </button>`;
        }
        return; // Done — no outerHTML replacement needed
      }

      // --- Product card or Wishlist card: replace specific child ---
      let newCartHtml;
      if (quantity > 0) {
        newCartHtml = `
          <div class="cart-quantity-controls d-flex align-items-center flex-grow-1" style="height: 100%;">
            <div class="d-flex align-items-center w-100" style="height: 100%; border-radius: 0; overflow: hidden; background: #212529;">
              <button type="button" class="btn btn-dark btn-decrement m-0 border-0" data-product-id="${productId}" style="height: 100%; border-radius: 0; border-right: 1px solid rgba(255,255,255,0.3); min-width: 40px;">−</button>
              <span class="quantity-display flex-grow-1 text-center" style="font-weight: bold; color: #fff;">${quantity}</span>
              <button type="button" class="btn btn-dark btn-increment m-0 border-0" data-product-id="${productId}" style="height: 100%; border-radius: 0; border-left: 1px solid rgba(255,255,255,0.3); min-width: 40px;">+</button>
            </div>
          </div>`;
      } else if (isInBtnGroup) {
        newCartHtml = `
          <button type="button" class="btn btn-dark m-0 btn-add-to-cart flex-grow-1 rounded-0" data-product-id="${productId}" style="border-radius: 0 !important; font-size: 0.8rem;">
            <i class="fas fa-shopping-cart"></i> Add to Cart
          </button>`;
      } else {
        // Wishlist card
        newCartHtml = `
          <button type="button" class="btn btn-dark m-0 btn-add-to-cart w-100 h-100 rounded-0" data-product-id="${productId}" style="border-radius: 0 !important; font-size: 0.8rem;">
            <i class="fas fa-shopping-cart"></i> Add to Cart
          </button>`;
      }

      if (quantityControls) {
        quantityControls.outerHTML = newCartHtml;
      } else if (cartBtn) {
        cartBtn.outerHTML = newCartHtml;
      }
    });
  };

  const debounceTimers = {};

  const performUpdate = async (productId, newQty, currentQty) => {
    try {
      const res = await fetch('/user/cart/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, quantity: newQty })
      });
      const data = await res.json();
      if (res.ok) {
        if (data.newQuantity !== newQty) {
          showToast(data.message, 'warning');
          updateUI(productId, data.newQuantity);
        } else {
          showToast("Cart updated");
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
      if (!(err instanceof ReferenceError)) {
        showToast("Error updating cart", 'error');
      }
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
      target.classList.contains('btn-add-to-wishlist'))) {
      showToast("Please log in to continue", 'error');
      return;
    }

    // ADD TO CART
    if (target.classList.contains('btn-add-to-cart')) {
      e.preventDefault();
      try {
        const res = await fetch('/user/cart/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: userId, productId, quantity: 1 })
        });
        const data = await res.json();
        if (res.ok) {
          showToast(data.message);
          updateUI(productId, 1);
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
        // Only show generic error if it wasn't a handled status change (ReferenceError fix)
        if (!(err instanceof ReferenceError)) {
          showToast("Something went wrong", 'error');
        }
      }
    }

  // syncProductAvailability moved to top scope

    // INCREMENT
    if (target.classList.contains('btn-increment')) {
      e.preventDefault();
      const display = target.closest('.cart-quantity-controls').querySelector('.quantity-display');
      const currentQty = parseInt(display.textContent);
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
          const res = await fetch('/user/cart/remove', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId })
          });
          const data = await res.json();
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
      try {
        const res = await fetch('/user/add-to-wishlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, productId })
        });
        const data = await res.json();
        showToast(data.message, res.ok ? 'success' : 'error');
      } catch (err) {
        console.error(err);
        showToast("Error adding to wishlist", 'error');
      }
    }

    // WISHLIST REMOVE
    if (target.classList.contains('btn-remove-from-wishlist')) {
      e.preventDefault();
      Swal.fire({
        title: 'Are you sure?',
        text: "You want to remove this product from your wishlist!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Yes, remove it!'
      }).then(async (result) => {
        if (result.isConfirmed) {
          try {
            const res = await fetch(`/user/wishlist/remove/${productId}`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId })
            });
            const data = await res.json();
            if (res.ok) {
              const card = target.closest('.card-div');
              if (card) {
                card.remove();
                if (document.querySelectorAll('.card-div').length === 0) {
                  location.reload();
                }
              } else {
                showToast("Removed from wishlist");
              }
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
        try {
            const res = await fetch('/user/cart/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user: userId, productId, quantity: 1 })
            });
            const data = await res.json();
            if (res.ok) {
                window.location.href = '/user/cart';
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
