import mongoose from "mongoose";
import crypto from "crypto";
import Cart from "../model/cart.js";
import Offer from "../model/offer.js";
import Review from "../model/review.js";

// Helper to round to 2 decimal places
export const roundToTwo = (num) => {
  return +(Math.round(num + "e+2") + "e-2");
};

// Helper to generate unique Order ID
export const generateOrderId = () => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.floor(100000 + Math.random() * 900000);
  return `ORD-${date}-${random}`;
};

// Helper to generate unique Transaction ID
export async function generateTransactionId() {
  return `TRA-${Date.now()}-${crypto.randomInt(1000, 9999)}`;
}

// Helper to get cart item quantities map for the current user
export async function getCartItemMap(userId) {
  if (!userId) return {};
  const cart = await Cart.findOne({ user: userId });
  if (!cart) return {};
  const map = {};
  cart.products.forEach(item => {
    map[item.productId.toString()] = item.quantity;
  });
  return map;
}

const OFFER_TYPES = {
  FLAT: "flat",
  PERCENTAGE: "percentage",
};

const OFFER_FOR = {
  PRODUCT: "Product",
  CATEGORY: "Category",
};

export async function getBestOffer(product) {
  const offers = await Offer.find({
    $or: [
      { targetId: product._id, offerFor: OFFER_FOR.PRODUCT, isActive: true },
      {
        targetId: product.category?._id || product.category,
        offerFor: OFFER_FOR.CATEGORY,
        isActive: true,
      },
    ],
  });

  let bestOffer = null;
  let bestDiscountedPrice = product.price;

  offers.forEach((offer) => {
    // Check if offer is active and not expired
    const isExpired = offer.expiresAt && new Date(offer.expiresAt) <= new Date();
    if (offer.isActive && !isExpired) {
      const discountedPrice = calculateDiscountedPrice(offer, product);
      if (discountedPrice < bestDiscountedPrice) {
        bestDiscountedPrice = discountedPrice;
        bestOffer = offer.toObject ? offer.toObject() : { ...offer };
      }
    }
  });

  if (bestOffer) {
    bestOffer.discountedPrice = Math.floor(bestDiscountedPrice);
  }

  return bestOffer;
}

export function calculateDiscountedPrice(offer, product) {
  let discountedPrice = product.price;

  if (offer.offerFor === OFFER_FOR.PRODUCT) {
    if (offer.offerType === OFFER_TYPES.FLAT) {
      discountedPrice -= offer.value;
    } else if (offer.offerType === OFFER_TYPES.PERCENTAGE) {
      discountedPrice *= 1 - (offer.value / 100);
    }
    discountedPrice = Math.floor(discountedPrice);
  } else if (offer.offerFor === OFFER_FOR.CATEGORY) {
    if (
      offer.offerType === OFFER_TYPES.FLAT &&
      product.price >= offer.minProductPrice
    ) {
      discountedPrice -= offer.value;
    } else if (offer.offerType === OFFER_TYPES.PERCENTAGE) {
      discountedPrice *= 1 - (offer.value / 100);
    }
    discountedPrice = Math.floor(discountedPrice);
  }

  // Ensure price doesn't go below zero and truncate
  return Math.floor(Math.max(discountedPrice, 0));
}

export async function getBestOfferBatch(products) {
  if (!products || products.length === 0) return [];

  const productIds = products.map(p => p._id);
  const categoryIds = products.map(p => p.category?._id || p.category).filter(c => c);

  // Fetch all relevant active offers in one query
  const allOffers = await Offer.find({
    isActive: true,
    $or: [
      { targetId: { $in: productIds }, offerFor: OFFER_FOR.PRODUCT },
      { targetId: { $in: categoryIds }, offerFor: OFFER_FOR.CATEGORY }
    ],
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: { $gt: new Date() } }
    ]
  });

  return products.map(product => {
    let bestOffer = null;
    let bestDiscountedPrice = product.price;

    const relevantOffers = allOffers.filter(offer => {
      const targetIdStr = String(offer.targetId);
      const productIdStr = String(product._id);
      const categoryIdStr = String(product.category?._id || product.category);
      
      return (offer.offerFor === OFFER_FOR.PRODUCT && targetIdStr === productIdStr) ||
             (offer.offerFor === OFFER_FOR.CATEGORY && targetIdStr === categoryIdStr);
    });

    relevantOffers.forEach(offer => {
      const discountedPrice = calculateDiscountedPrice(offer, product);
      if (discountedPrice < bestDiscountedPrice) {
        bestDiscountedPrice = discountedPrice;
        bestOffer = offer.toObject ? offer.toObject() : { ...offer };
      }
    });

    if (bestOffer) {
      bestOffer.discountedPrice = Math.floor(bestDiscountedPrice);
    }
    return bestOffer;
  });
}

export async function getAverageRatingsForProducts(products) {
  if (!products || products.length === 0) return {};
  const productIds = products.map(p => new mongoose.Types.ObjectId(p._id || p.productId?._id || p));
  const ratings = await Review.aggregate([
    { $match: { productId: { $in: productIds }, isListed: true } },
    { $group: { _id: "$productId", averageRating: { $avg: "$rating" } } }
  ]);

  return ratings.reduce((map, r) => {
    map[r._id.toString()] = r.averageRating.toFixed(1);
    return map;
  }, {});
}
