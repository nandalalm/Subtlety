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
      backgroundColor: bgColor,
    }).showToast();
  };

  const updateUI = (productId, quantity) => {
    // Select ALL containers for this product ID across the entire page
    const containers = document.querySelectorAll(`.cart-controls-container[data-product-id="${productId}"]`);
    containers.forEach(container => {
      const cartBtn = container.querySelector('.btn-add-to-cart');
      const quantityControls = container.querySelector('.cart-quantity-controls');

      // Use flex-grow-1 and w-100 to ensure it behaves well in both btn-group and custom layouts
      const newCartHtml = quantity > 0
        ? `
                    <div class="cart-quantity-controls d-flex align-items-center flex-grow-1" style="height: 100%;">
                        <button type="button" class="btn btn-dark btn-decrement m-0 rounded-0" data-product-id="${productId}" style="height: 100%; border-radius: 0 !important; min-width: 40px;">-</button>
                        <span class="quantity-display flex-grow-1 text-center" style="font-weight: bold; color: #333; background: #eee; height: 100%; display: flex; align-items: center; justify-content: center;">${quantity}</span>
                        <button type="button" class="btn btn-dark btn-increment m-0 rounded-0" data-product-id="${productId}" style="height: 100%; border-radius: 0 !important; min-width: 40px;">+</button>
                    </div>
                `
        : `
                    <button type="button" class="btn btn-dark m-0 btn-add-to-cart h-100 w-100 rounded-0" data-product-id="${productId}" style="border-radius: 0 !important;">
                        <i class="fas fa-shopping-cart"></i> Add to Cart
                    </button>
                `;

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
        updateUI(productId, currentQty);
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
        }
      } catch (err) {
        console.error(err);
        showToast("Something went wrong", 'error');
      }
    }

    // INCREMENT
    if (target.classList.contains('btn-increment')) {
      e.preventDefault();
      const display = target.parentElement.querySelector('.quantity-display');
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
      const display = target.parentElement.querySelector('.quantity-display');
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
  });
});
