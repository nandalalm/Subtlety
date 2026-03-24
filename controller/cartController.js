import Cart from "../model/cart.js";
import Product from "../model/product.js";
import { getBestOffer } from "../utils/helper.js";
import HTTP_STATUS from "../Constants/httpStatus.js";
import MESSAGES from "../Constants/messages.js";

async function getCart(req, res, next) {
  const userId = req.session.user._id;

  try {
    const cart = await Cart.findOne({ user: userId }).populate(
      "products.productId"
    );

    // Check if cart is found
    if (!cart) {
      return res.status(HTTP_STATUS.OK).render("user/cart", {
        user: req.session.user,
        cart: null,
        subtotal: 0,
        deliveryCharge: 50,
        total: 50,
      });
    }

    // Calculate discounted prices and total
    let subtotal = 0;
    const updatedProducts = await Promise.all(
      cart.products.map(async (item) => {
        const bestOffer = await getBestOffer(item.productId);
        let price = item.productId.price;
        if (bestOffer) {
          price = bestOffer.discountedPrice;
        }
        subtotal += price * item.quantity;
        return {
          ...item.toObject(),
          discountedPrice: price,
        };
      })
    );

    const deliveryCharge = 50; // Fixed delivery charge
    const total = subtotal + deliveryCharge;

    res.status(HTTP_STATUS.OK).render("user/cart", {
      user: req.session.user,
      cart: { ...cart.toObject(), products: updatedProducts },
      subtotal,
      deliveryCharge,
      total,
    });
  } catch (error) {
    next(error);
  }
}

async function addToCart(req, res, next) {
  const { user, productId, quantity } = req.body;

  if (!user) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: MESSAGES.CART.USER_REQUIRED });
  }

  // Limit the maximum quantity of a single product to 10
  const MAX_QUANTITY = 10;

  // Check if the requested quantity exceeds the maximum limit
  if (quantity > MAX_QUANTITY) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      message: MESSAGES.CART.MAX_QUANTITY_EXCEEDED(MAX_QUANTITY),
    });
  }

  try {
    // Find user's cart
    let cart = await Cart.findOne({ user });
    if (!cart) {
      cart = new Cart({ user, products: [] });
    }

    // Retrieve the product's stock
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ message: MESSAGES.CART.PRODUCT_NOT_FOUND });
    }

    // Check if the product is listed
    if (!product.isListed) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        status: 'unlisted',
        message: MESSAGES.CART.PRODUCT_UNLISTED
      });
    }

    // Check if the product is out of stock
    if (product.stock === 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        status: 'out-of-stock',
        message: MESSAGES.CART.OUT_OF_STOCK
      });
    }

    // Check if only 1 quantity is left and it's already in the cart
    const existingProductIndex = cart.products.findIndex(
      (item) => item.productId.toString() === productId
    );
    if (product.stock === 1 && existingProductIndex > -1) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        status: 'low-stock',
        message: MESSAGES.CART.LOW_STOCK_CART,
      });
    }

    // Check stock availability
    const totalQuantityInCart = cart.products.reduce((acc, item) => {
      if (item.productId.toString() === productId) {
        return acc + item.quantity; // Sum the quantities of this product in the cart
      }
      return acc;
    }, 0);

    // Check if adding the new quantity exceeds the stock
    if (totalQuantityInCart + quantity > product.stock) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        status: 'low-stock',
        message: MESSAGES.CART.LOW_STOCK_AVAILABLE(product.stock),
      });
    }

    if (existingProductIndex > -1) {
      // If the product already exists, update the quantity
      const newQuantity =
        cart.products[existingProductIndex].quantity + quantity;
      // Ensure the new quantity does not exceed the maximum limit
      if (newQuantity > MAX_QUANTITY) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          message: MESSAGES.CART.MAX_QUANTITY_CART(MAX_QUANTITY),
        });
      }
      cart.products[existingProductIndex].quantity = newQuantity;

      // Update discountedPrice as well
      const bestOffer = await getBestOffer(product);
      cart.products[existingProductIndex].discountedPrice = bestOffer ? bestOffer.discountedPrice : product.price;
    } else {
      // If the product does not exist, add it to the cart
      const bestOffer = await getBestOffer(product);
      const discountedPrice = bestOffer ? bestOffer.discountedPrice : product.price;
      cart.products.push({ productId, quantity, discountedPrice });
    }

    await cart.save();
    return res.status(HTTP_STATUS.OK).json({ message: MESSAGES.CART.ITEM_ADDED });
  } catch (error) {
    next(error);
  }
}

// Helper to calculate cart totals and individual item prices
async function calculateCartTotals(cart) {
  let subtotal = 0;
  const productsWithPrices = await Promise.all(
    cart.products.map(async (item) => {
      const bestOffer = await getBestOffer(item.productId);
      let price = item.productId.price;
      if (bestOffer) {
        price = bestOffer.discountedPrice;
      }
      subtotal += price * item.quantity;
      return {
        productId: item.productId._id.toString(),
        itemPrice: price,
        discountedPrice: price, // For consistency with updatedProducts in getCart
        totalItemPrice: price * item.quantity
      };
    })
  );

  const deliveryCharge = 50;
  const total = subtotal + deliveryCharge;

  return { subtotal, total, productsWithPrices };
}

async function removeFromCart(req, res, next) {
  const userId = req.session.user._id;
  const { productId } = req.body;

  try {
    const cart = await Cart.findOne({ user: userId }).populate("products.productId");
    if (cart) {
      cart.products = cart.products.filter(
        (item) => item.productId._id.toString() !== productId
      );
      await cart.save();

      const { subtotal, total } = await calculateCartTotals(cart);

      return res.status(HTTP_STATUS.OK).json({
        message: MESSAGES.CART.ITEM_REMOVED,
        subtotal,
        total,
        cartCount: cart.products.length
      });
    } else {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ message: MESSAGES.CART.CART_NOT_FOUND });
    }
  } catch (error) {
    next(error);
  }
}

async function updateQuantity(req, res, next) {
  const userId = req.session.user._id;
  let { productId, quantity } = req.body;

  const MAX_QUANTITY = 10;
  quantity = parseInt(quantity);

  try {
    const cart = await Cart.findOne({ user: userId }).populate("products.productId");
    if (cart) {
      const productIndex = cart.products.findIndex(
        (item) => item.productId._id.toString() === productId
      );

      if (productIndex > -1) {
        const product = await Product.findById(productId);
        if (!product) {
          return res.status(HTTP_STATUS.NOT_FOUND).json({ message: MESSAGES.CART.PRODUCT_NOT_FOUND });
        }

        // Check if the product is listed
        if (!product.isListed) {
          return res.status(HTTP_STATUS.BAD_REQUEST).json({
            status: 'unlisted',
            message: MESSAGES.CART.PRODUCT_UNLISTED
          });
        }

        let message = null;
        const stockLimit = product.stock;
        const effectiveLimit = Math.min(MAX_QUANTITY, stockLimit);

        // Graceful clamping
        if (quantity < 1) {
          quantity = 1;
          message = MESSAGES.CART.MIN_QUANTITY;
        } else if (quantity > effectiveLimit) {
          quantity = effectiveLimit;
          message = stockLimit < MAX_QUANTITY
            ? MESSAGES.CART.LOW_STOCK_UPDATE(stockLimit)
            : MESSAGES.CART.MAX_QUANTITY_UPDATE(MAX_QUANTITY);
        }

        cart.products[productIndex].quantity = quantity;

        // Update discountedPrice during quantity change to keep baseline current
        const bestOffer = await getBestOffer(product);
        cart.products[productIndex].discountedPrice = bestOffer ? bestOffer.discountedPrice : product.price;

        await cart.save();

        const { subtotal, total, productsWithPrices } = await calculateCartTotals(cart);
        const itemInfo = productsWithPrices.find(p => p.productId === productId);

        return res.status(HTTP_STATUS.OK).json({
          message: message || MESSAGES.CART.QUANTITY_UPDATED,
          newQuantity: quantity,
          subtotal,
          total,
          itemPrice: itemInfo ? itemInfo.itemPrice : product.price,
          totalItemPrice: itemInfo ? itemInfo.totalItemPrice : (product.price * quantity)
        });
      } else {
        return res.status(HTTP_STATUS.NOT_FOUND).json({ message: MESSAGES.CART.PRODUCT_NOT_IN_CART });
      }
    } else {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ message: MESSAGES.CART.CART_NOT_FOUND });
    }
  } catch (error) {
    next(error);
  }
}

export {
  getCart,
  addToCart,
  removeFromCart,
  updateQuantity,
  calculateCartTotals
};
