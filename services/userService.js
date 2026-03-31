import userRepository from "../repositories/userRepository.js";
import productRepository from "../repositories/productRepository.js";
import categoryRepository from "../repositories/categoryRepository.js";
import orderRepository from "../repositories/orderRepository.js";
import couponRepository from "../repositories/couponRepository.js";
import reviewRepository from "../repositories/reviewRepository.js";
import { getBestOffer, getAverageRatingsForProducts, getBestOfferBatch } from "../utils/helper.js";
import mongoose from "mongoose";

const userService = {
  getHomeData: async () => {
    // Fetch all needed data for home page
    const [categories, products] = await Promise.all([
      categoryRepository.find({ isListed: true }),
      productRepository.find({ isListed: true })
    ]);

    const ratingMap = await getAverageRatingsForProducts(products);
    const bestOffers = await getBestOfferBatch(products);
    
    const productsWithOffers = products.map((product, index) => {
      const bestOffer = bestOffers[index];
      const averageRating = ratingMap[product._id.toString()] || 0;
      return { product, bestOffer, averageRating };
    });

    const bestSellingProducts = await aggregateProductFrequency();
    let bestSellingWithOffers = [];

    if (bestSellingProducts.length > 0) {
      const bestSellingProductIds = bestSellingProducts.slice(0, 4).map(item => item._id);
      const bestSellingDetails = await productRepository.find({ _id: { $in: bestSellingProductIds } });
      const bestSellingRatingMap = await getAverageRatingsForProducts(bestSellingDetails);
      const bestSellingOffers = await getBestOfferBatch(bestSellingDetails);
      
      bestSellingWithOffers = bestSellingDetails.map((product, index) => {
        const bestOffer = bestSellingOffers[index];
        const averageRating = bestSellingRatingMap[product._id.toString()] || 0;
        const count = bestSellingProducts.find(f => String(f._id) === String(product._id)).count;
        return { product, bestOffer, count, averageRating };
      });
      bestSellingWithOffers.sort((a, b) => b.count - a.count);
    }

    const latestProducts = await productRepository.find({ isListed: true }, { createdAt: -1 }, 0, 4);
    const latestRatingMap = await getAverageRatingsForProducts(latestProducts);
    const latestOffers = await getBestOfferBatch(latestProducts);
    
    const latestWithOffers = latestProducts.map((product, index) => {
      const bestOffer = latestOffers[index];
      const averageRating = latestRatingMap[product._id.toString()] || 0;
      return { product, bestOffer, averageRating };
    });
    latestWithOffers.sort((a, b) => a.product.name.localeCompare(b.product.name));

    return {
      categories,
      productsWithOffers,
      bestSellingProducts: bestSellingWithOffers.slice(0, 4),
      latestProducts: latestWithOffers
    };
  },

  getShopData: async (queryParams) => {
    const { page = 1, limit = 8, search = "", category = "", sort = "" } = queryParams;
    const skip = (page - 1) * limit;

    let query = { isListed: true };
    if (category && category !== "all") {
      query.category = category;
    }
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    let products = await productRepository.find(query, {}, skip, limit);
    
    if (sort) {
      if (sort === "priceLowToHigh") products.sort((a, b) => a.price - b.price);
      else if (sort === "priceHighToLow") products.sort((a, b) => b.price - a.price);
      else if (sort === "aToZ") products.sort((a, b) => a.name.localeCompare(b.name));
      else if (sort === "zToA") products.sort((a, b) => b.name.localeCompare(a.name));
    }

    const totalProducts = await productRepository.countDocuments(query);
    const ratingMap = await getAverageRatingsForProducts(products);
    const bestOffers = await getBestOfferBatch(products);
    
    const productsWithOffers = products.map((product, index) => {
      const bestOffer = bestOffers[index];
      const averageRating = ratingMap[product._id.toString()] || 0;
      return { product, bestOffer, averageRating };
    });

    const categories = await categoryRepository.find({ isListed: true });

    return {
      productsWithOffers,
      categories,
      totalProducts,
      hasMore: totalProducts > skip + products.length,
      limit
    };
  },

  getProductDetails: async (id) => {
    const product = await productRepository.findByIdAndPopulate(id, "category");
    if (!product) return null;

    const [categories, relatedProducts, bestOffer, activeCoupons, reviews, ratingStats] = await Promise.all([
      categoryRepository.find({}),
      productRepository.find({ category: product.category, _id: { $ne: product._id }, isListed: true }, {}, 0, 4),
      getBestOffer(product),
      couponRepository.find({ isActive: true, expiresAt: { $gte: new Date() } }),
      reviewRepository.find({ productId: id, isListed: true, comment: { $exists: true, $ne: "" } }, { createdAt: -1 }, 0, 5),
      reviewRepository.aggregate([
        { $match: { productId: new mongoose.Types.ObjectId(id), isListed: true } },
        { $group: { _id: null, averageRating: { $avg: "$rating" } } }
      ])
    ]);

    const relatedRatingMap = await getAverageRatingsForProducts(relatedProducts);
    const relatedOffers = await getBestOfferBatch(relatedProducts);
    
    const relatedWithOffers = relatedProducts.map((rp, index) => {
      const bo = relatedOffers[index];
      const ar = relatedRatingMap[rp._id.toString()] || 0;
      return { product: rp, bestOffer: bo, averageRating: ar };
    });

    const totalRelated = await productRepository.countDocuments({ category: product.category, _id: { $ne: product._id }, isListed: true });
    
    // Coupon logic
    const validCoupons = activeCoupons.filter(c => {
      if (c.discountType === 'percentage') return true;
      if (c.discountType === 'flat' && product.price >= (c.minOrderValue || 0)) return true;
      return false;
    }).map(c => {
      let effective = 0;
      if (c.discountType === 'flat') effective = c.discountAmount;
      else {
        effective = (product.price * c.discountAmount) / 100;
        if (c.maxDiscount) effective = Math.min(effective, c.maxDiscount);
      }
      return { coupon: c, effective };
    }).sort((a, b) => b.effective - a.effective).slice(0, 2).map(item => item.coupon);

    const totalReviews = await reviewRepository.countDocuments({ productId: id, isListed: true, comment: { $exists: true, $ne: "" } });

    return {
      product,
      categories,
      relatedProductsWithOffers: relatedWithOffers,
      bestOffer,
      activeCoupons: validCoupons,
      hasMoreRelated: totalRelated > relatedProducts.length,
      reviews,
      totalReviews,
      totalReviewsCount: totalReviews,
      hasMoreReviews: totalReviews > reviews.length,
      averageRating: ratingStats.length > 0 ? ratingStats[0].averageRating.toFixed(1) : 0
    };
  },

  getMoreRelatedProducts: async (productId, categoryId, page = 2, limit = 4) => {
    const skip = (page - 1) * limit;
    const query = {
      category: categoryId,
      _id: { $ne: productId },
      isListed: true
    };

    const products = await productRepository.find(query, {}, skip, limit);
    const ratingMap = await getAverageRatingsForProducts(products);
    const productsWithOffers = await Promise.all(
      products.map(async (p) => {
        const bestOffer = await getBestOffer(p);
        const averageRating = ratingMap[p._id.toString()] || 0;
        return { product: p, bestOffer, averageRating };
      })
    );

    const total = await productRepository.countDocuments(query);
    return {
      products: productsWithOffers,
      hasMore: total > skip + products.length
    };
  },

  getSectionReplacement: async ({ section, excludeProductIds = [], productId = null, categoryId = null }) => {
    const listedCategories = await categoryRepository.find({ isListed: true });
    const listedCategoryIds = listedCategories.map((category) => category._id);
    const excludedIds = excludeProductIds
      .filter(Boolean)
      .map((id) => new mongoose.Types.ObjectId(id));

    if (section === "latest") {
      const query = {
        isListed: true,
        category: { $in: listedCategoryIds },
        _id: { $nin: excludedIds }
      };
      const products = await productRepository.find(query, { createdAt: -1 }, 0, 1);
      return await mapSectionProducts(products, query);
    }

    if (section === "best-selling") {
      const rankedProducts = await aggregateProductFrequency();
      const rankedIds = rankedProducts
        .map((item) => String(item._id))
        .filter((id) => !excludeProductIds.includes(id));

      if (!rankedIds.length) return { products: [], hasMore: false };

      const products = await productRepository.find({
        _id: { $in: rankedIds },
        isListed: true,
        category: { $in: listedCategoryIds }
      });

      const orderedProducts = rankedIds
        .map((id) => products.find((product) => String(product._id) === String(id)))
        .filter(Boolean);

      return await mapSectionProducts(orderedProducts.slice(0, 1), {
        _id: { $in: rankedIds },
        isListed: true,
        category: { $in: listedCategoryIds }
      }, orderedProducts.length);
    }

    if (section === "related") {
      const query = {
        category: categoryId,
        _id: { $nin: [new mongoose.Types.ObjectId(productId), ...excludedIds] },
        isListed: true
      };
      const products = await productRepository.find(query, {}, 0, 1);
      return await mapSectionProducts(products, query);
    }

    return { products: [], hasMore: false };
  }
};

async function mapSectionProducts(products, query, totalAvailable = null) {
  if (!products.length) return { products: [], hasMore: false };

  const ratingMap = await getAverageRatingsForProducts(products);
  const bestOffers = await getBestOfferBatch(products);
  const productsWithOffers = products.map((product, index) => ({
    product,
    bestOffer: bestOffers[index],
    averageRating: ratingMap[product._id.toString()] || 0
  }));

  const totalCount = totalAvailable === null ? await productRepository.countDocuments(query) : totalAvailable;
  return {
    products: productsWithOffers,
    hasMore: totalCount > products.length
  };
}

async function aggregateProductFrequency(limit = 0) {
  const pipeline = [
    { $match: { orderStatus: "Completed" } },
    { $unwind: "$items" },
    { $match: { "items.status": "Delivered" } },
    { $group: { _id: "$items.productId", count: { $sum: "$items.quantity" } } },
    { $sort: { count: -1 } }
  ];

  if (limit > 0) pipeline.push({ $limit: limit });
  return await orderRepository.aggregate(pipeline);
}

export default userService;
