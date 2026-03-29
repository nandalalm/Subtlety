import cartRepository from "../repositories/cartRepository.js";
import productRepository from "../repositories/productRepository.js";
import { getBestOffer, getBestOfferBatch } from "../utils/helper.js";
import MESSAGES from "../Constants/messages.js";

const cartService = {
  getCart: async (userId) => {
    const cart = await cartRepository.findOneWithPopulate({ user: userId }, {
      path: "products.productId",
      populate: { path: "category", model: "Category" }
    });

    if (!cart) return null;

    const products = cart.products.map(item => item.productId);
    const bestOffers = await getBestOfferBatch(products);

    const productsWithPrices = cart.products.map((item, index) => {
      const product = item.productId;
      const bestOffer = bestOffers[index];
      return {
        ...item.toObject(),
        productId: {
          ...product.toObject(),
          bestOffer
        }
      };
    });

    const totals = await cartService.getCartTotals(userId);
    return { ...cart.toObject(), products: productsWithPrices, ...totals };
  },

  addToCart: async (userId, productId, quantity) => {
    const product = await productRepository.findById(productId);
    if (!product) {
      throw { statusCode: 404, message: MESSAGES.CART.PRODUCT_NOT_FOUND };
    }

    if (!product.isListed) {
      throw { statusCode: 400, message: MESSAGES.CART.PRODUCT_UNLISTED };
    }

    if (product.stock <= 0) {
      throw { statusCode: 400, message: MESSAGES.CART.OUT_OF_STOCK };
    }

    let cart = await cartRepository.findOne({ user: userId });
    if (!cart) {
      cart = await cartRepository.save({ user: userId, products: [] });
    }

    const productIndex = cart.products.findIndex(p => String(p.productId) === String(productId));
    const maxQuantityPerProduct = 10;

    if (productIndex > -1) {
      const newQuantity = cart.products[productIndex].quantity + quantity;
      if (newQuantity > maxQuantityPerProduct) {
        throw { statusCode: 400, message: MESSAGES.CART.MAX_QUANTITY_CART(maxQuantityPerProduct) };
      }
      if (newQuantity > product.stock) {
        throw { statusCode: 400, message: MESSAGES.CART.LOW_STOCK_UPDATE(product.stock) };
      }
      cart.products[productIndex].quantity = newQuantity;
    } else {
      if (quantity > maxQuantityPerProduct) {
        throw { statusCode: 400, message: MESSAGES.CART.MAX_QUANTITY_EXCEEDED(maxQuantityPerProduct) };
      }
      if (quantity > product.stock) {
        throw { statusCode: 400, message: MESSAGES.CART.LOW_STOCK_AVAILABLE(product.stock) };
      }
      cart.products.push({ productId, quantity });
    }

    return await cart.save();
  },

  updateQuantity: async (userId, productId, quantity) => {
    const cart = await cartRepository.findOne({ user: userId });
    if (!cart) {
      throw { statusCode: 404, message: MESSAGES.CART.CART_NOT_FOUND };
    }

    const productIndex = cart.products.findIndex(p => String(p.productId) === String(productId));
    if (productIndex === -1) {
      throw { statusCode: 404, message: MESSAGES.CART.PRODUCT_NOT_IN_CART };
    }

    const product = await productRepository.findById(productId);
    if (!product) {
      throw { statusCode: 404, message: MESSAGES.CART.PRODUCT_NOT_FOUND };
    }

    const maxQuantityPerProduct = 10;
    if (quantity > maxQuantityPerProduct) {
      throw { statusCode: 400, message: MESSAGES.CART.MAX_QUANTITY_UPDATE(maxQuantityPerProduct) };
    }
    if (quantity > product.stock) {
      throw { statusCode: 400, message: MESSAGES.CART.LOW_STOCK_UPDATE(product.stock) };
    }

    cart.products[productIndex].quantity = quantity;
    await cart.save();
    const totals = await cartService.getCartTotals(userId);
    return { newQuantity: quantity, stock: product.stock, ...totals };
  },

  removeFromCart: async (userId, productId) => {
    await cartRepository.updateByQuery(
      { user: userId },
      { $pull: { products: { productId } } }
    );
    return await cartService.getCartTotals(userId);
  },

  getCartTotals: async (userId) => {
    const cart = await cartRepository.findOneWithPopulate({ user: userId }, {
      path: "products.productId",
      select: "price stock isListed category",
      populate: { path: "category", model: "Category", select: "name" }
    });

    if (!cart) return { subtotal: 0, offerDiscount: 0, deliveryFee: 0, total: 0, cartCount: 0 };

    const products = cart.products.map(item => item.productId);
    const bestOffers = await getBestOfferBatch(products);

    let originalSubtotal = 0;
    let offerDiscount = 0;

    cart.products.forEach((item, index) => {
      const product = item.productId;
      const bestOffer = bestOffers[index];
      
      if (product.isListed && product.stock > 0) {
        const qty = Math.min(item.quantity, product.stock);
        const originalPrice = product.price;
        const discountedPrice = bestOffer ? bestOffer.discountedPrice : originalPrice;
        
        originalSubtotal += originalPrice * qty;
        offerDiscount += (originalPrice - discountedPrice) * qty;
      }
    });

    originalSubtotal = Math.floor(originalSubtotal);
    offerDiscount = Math.floor(offerDiscount);
    const netTotal = originalSubtotal - offerDiscount;
    const deliveryFee = (netTotal > 0 && netTotal < 600) ? 80 : 0;
    const total = netTotal + deliveryFee;

    return {
      subtotal: originalSubtotal,
      offerDiscount: Math.max(0, offerDiscount),
      deliveryFee: Math.floor(deliveryFee),
      total: Math.floor(total),
      cartCount: cart.products.length
    };
  }
};

export default cartService;
