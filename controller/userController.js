import mongoose from "mongoose";
import Product from "../model/product.js";
import Category from "../model/category.js";
import Order from "../model/order.js";
import Coupon from "../model/coupon.js";
import Review from "../model/review.js";
import {
  getBestOffer,
  getAverageRatingsForProducts,
  getCartItemMap
} from "../utils/helper.js";
import HTTP_STATUS from "../Constants/httpStatus.js";
import MESSAGES from "../Constants/messages.js";


async function getHome(req, res, next) {
  try {
    const user = req.session.user;
    const cartItemMap = await getCartItemMap(user ? user._id : null);

    // Fetch all products and categories
    const products = await Product.find({ isListed: true });
    const categories = await Category.find({ isListed: true });
    const ratingMap = await getAverageRatingsForProducts(products);

    // Fetch the best offer for each product
    const productsWithOffers = await Promise.all(
      products.map(async (product) => {
        const bestOffer = await getBestOffer(product);
        const averageRating = ratingMap[product._id.toString()] || 0;
        return { product, bestOffer, averageRating };
      })
    );

    // Fetch the top 4 best-selling products based on order frequency
    const bestSellingProducts = await aggregateProductFrequency();

    let bestSellingProductsWithOffers = [];

    if (bestSellingProducts.length > 0) {
      const bestSellingProductIds = bestSellingProducts
        .slice(0, 4)
        .map((item) => item._id);
      const bestSellingProductDetails = await Product.find({
        _id: { $in: bestSellingProductIds },
      });

      // Fetch best offers for the top-selling products
      const bestSellingRatingMap = await getAverageRatingsForProducts(bestSellingProductDetails);
      bestSellingProductsWithOffers = await Promise.all(
        bestSellingProductDetails.map(async (product) => {
          const bestOffer = await getBestOffer(product);
          const averageRating = bestSellingRatingMap[product._id.toString()] || 0;
          return { product, bestOffer, averageRating };
        })
      );

      // Sort the best-selling products by frequency count
      bestSellingProductsWithOffers = bestSellingProductsWithOffers
        .map(({ product, bestOffer, averageRating }) => {
          const count = bestSellingProducts.find(
            (f) => f._id.toString() === product._id.toString()
          ).count;
          return { product, bestOffer, count, averageRating };
        })
        .sort((a, b) => b.count - a.count);
    }
    const latestProductsWithOffers = await Product.find({ isListed: true })
      .sort({ createdAt: -1 })
      .collation({ locale: "en", strength: 2 })
      .limit(4);

    latestProductsWithOffers.sort((a, b) => a.name.localeCompare(b.name));

    // Fetch offers for the latest products
    const latestRatingMap = await getAverageRatingsForProducts(latestProductsWithOffers);
    const latestProductsWithOffersAndDetails = await Promise.all(
      latestProductsWithOffers.map(async (product) => {
        const bestOffer = await getBestOffer(product);
        const averageRating = latestRatingMap[product._id.toString()] || 0;
        return { product, bestOffer, averageRating };
      })
    );

    // Fallback to first 4 products if no best-selling products are available
    const fallbackBestSellingProducts = products.slice(0, 4);

    // Fetch best offers for the fallback products
    const fallbackRatingMap = await getAverageRatingsForProducts(fallbackBestSellingProducts);
    const fallbackProductsWithOffers = await Promise.all(
      fallbackBestSellingProducts.map(async (product) => {
        const bestOffer = await getBestOffer(product);
        const averageRating = fallbackRatingMap[product._id.toString()] || 0;
        return { product, bestOffer, averageRating };
      })
    );

    res.render("user/home", {
      user,
      productsWithOffers,
      cartItemMap,
      categories,
      bestSellingProducts: bestSellingProductsWithOffers.slice(0, 4),
      fallbackProducts: fallbackProductsWithOffers,
      latestProducts: latestProductsWithOffersAndDetails,
    });
  } catch (error) {
    next(error);
  }
}

const aggregateProductFrequency = async () => {
  const productFrequency = await Order.aggregate([
    {
      $match: {
        orderStatus: "Completed",
      },
    },
    { $unwind: "$items" },
    {
      $match: {
        "items.status": "Delivered",
      },
    },
    {
      $group: {
        _id: "$items.productId",
        count: { $sum: "$items.quantity" },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 4 },
  ]);

  return productFrequency;
};


async function getShopPage(req, res, next) {
  try {
    const user = req.session.user || null;
    const cartItemMap = await getCartItemMap(user ? user._id : null);
    const { search, sort, category } = req.query;
    const query = { isListed: true };

    if (category && category !== "all") {
      const categoryDoc = await Category.findById(category);
      if (categoryDoc) {
        query.category = categoryDoc._id;
      }
    }

    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const page = parseInt(req.query.page) || 1;
    const limit = 8;
    const skip = (page - 1) * limit;

    let products = await Product.find(query).skip(skip).limit(limit);

    if (sort) {
      if (sort === "priceLowToHigh") {
        products.sort((a, b) => a.price - b.price);
      } else if (sort === "priceHighToLow") {
        products.sort((a, b) => b.price - a.price);
      } else if (sort === "aToZ") {
        products.sort((a, b) => a.name.localeCompare(b.name));
      } else if (sort === "zToA") {
        products.sort((a, b) => b.name.localeCompare(a.name));
      }
    }

    const totalProducts = await Product.countDocuments(query);
    const hasMore = totalProducts > skip + products.length;

    const ratingMap = await getAverageRatingsForProducts(products);
    const productsWithOffers = await Promise.all(
      products.map(async (product) => {
        const bestOffer = await getBestOffer(product);
        const averageRating = ratingMap[product._id.toString()] || 0;
        return { product, bestOffer, averageRating };
      })
    );

    const categories = await Category.find({ isListed: true });

    res.render("user/shop", {
      productsWithOffers,
      categories,
      search,
      sort,
      category,
      user,
      cartItemMap,
      currentPage: page,
      hasMore
    });
  } catch (error) {
    next(error);
  }
}

async function getSingleProduct(req, res, next) {
  const { id } = req.params;
  try {
    const user = req.session.user;
    const cartItemMap = await getCartItemMap(user ? user._id : null);
    const product = await Product.findById(id).populate("category", "name");
    const categories = await Category.find({});

    if (!product) {
      return res.status(HTTP_STATUS.NOT_FOUND).send(MESSAGES.USER.PRODUCT_NOT_FOUND);
    }

    const categoryName = product.category
      ? product.category.name
      : "Uncategorized";

    // Fetch related products from the same category
    const limit = 4;
    const relatedProducts = await Product.find({
      category: product.category,
      _id: { $ne: product._id }, // Exclude the current product
      isListed: true
    }).limit(limit);

    const totalRelatedProducts = await Product.countDocuments({
      category: product.category,
      _id: { $ne: product._id },
      isListed: true
    });
    const hasMoreRelated = totalRelatedProducts > relatedProducts.length;

    // Get the best offer for the main product
    const bestOffer = await getBestOffer(product);

    // Get best offers and ratings for related products
    const relatedRatingMap = await getAverageRatingsForProducts(relatedProducts);
    const relatedProductsWithOffers = await Promise.all(
      relatedProducts.map(async (relatedProduct) => {
        const bestOffer = await getBestOffer(relatedProduct);
        const averageRating = relatedRatingMap[relatedProduct._id.toString()] || 0;
        return { product: relatedProduct, bestOffer, averageRating };
      })
    );

    // Calculate the discounted price for the main product if there's a best offer
    let discountedPrice = product.price;
    if (bestOffer) {
      discountedPrice = bestOffer.discountedPrice;
    }

    // Fetch active coupons for the product
    const currentDate = new Date();
    const activeCoupons = await Coupon.find({
      isActive: true,
      expiresAt: { $gte: currentDate },
    });

    // Filter coupons
    const validCoupons = activeCoupons.filter(coupon => {
      if (coupon.discountType === 'percentage') {
        return true;
      }
      if (coupon.discountType === 'flat' && product.price >= (coupon.minOrderValue || 0)) {
        return true;
      }
      return false;
    });

    // Calculate the effective discount for each valid coupon
    const couponsWithEffectiveDiscount = validCoupons.map(coupon => {
      let effectiveDiscount = 0;

      if (coupon.discountType === 'flat') {
        effectiveDiscount = coupon.discountAmount; // Flat discount
      } else if (coupon.discountType === 'percentage') {
        effectiveDiscount = (product.price * coupon.discountAmount) / 100; // Percentage discount based on product price
        if (coupon.maxDiscount) {
          effectiveDiscount = Math.min(effectiveDiscount, coupon.maxDiscount);
        }
      }

      return { coupon, effectiveDiscount };
    });

    // Sort the coupons by the effective discount (in descending order)
    const sortedCoupons = couponsWithEffectiveDiscount.sort((a, b) => b.effectiveDiscount - a.effectiveDiscount);

    // Select top 2 best coupons
    const topCoupons = sortedCoupons.slice(0, 2).map(item => item.coupon);

    // Fetch initial reviews (top 5) - only those with non-empty comments
    const reviews = await Review.find({ 
      productId: id, 
      isListed: true,
      comment: { $exists: true, $ne: "" }
    })
      .populate("userId", "firstname lastname")
      .sort({ createdAt: -1 })
      .limit(5);

    const totalReviewsCount = await Review.countDocuments({ 
      productId: id, 
      isListed: true,
      comment: { $exists: true, $ne: "" }
    });
    const hasMoreReviews = totalReviewsCount > reviews.length;

    // Calculate average rating
    const ratingStats = await Review.aggregate([
      { $match: { productId: new mongoose.Types.ObjectId(id), isListed: true } },
      { $group: { _id: null, averageRating: { $avg: "$rating" } } }
    ]);
    const averageRating = ratingStats.length > 0 ? ratingStats[0].averageRating.toFixed(1) : 0;

    res.render("user/single-product", {
      user,
      cartItemMap,
      product,
      bestOffer,
      discountedPrice,
      categoryName,
      categories,
      relatedProductsWithOffers,
      activeCoupons: topCoupons,
      hasMoreRelated,
      currentPage: 1,
      reviews,
      totalReviewsCount,
      hasMoreReviews,
      averageRating
    });
  } catch (error) {
    next(error);
  }
}

async function loadMoreRelatedProducts(req, res, next) {
  try {
    const user = req.session.user || null;
    const cartItemMap = await getCartItemMap(user ? user._id : null);
    const { productId, categoryId } = req.query;
    const page = parseInt(req.query.page) || 2;
    const limit = 4;
    const skip = (page - 1) * limit;

    const query = {
      category: categoryId,
      _id: { $ne: productId },
      isListed: true
    };

    const relatedProducts = await Product.find(query).skip(skip).limit(limit);

    const relatedRatingMap = await getAverageRatingsForProducts(relatedProducts);
    const relatedProductsWithOffers = await Promise.all(
      relatedProducts.map(async (relatedProduct) => {
        const bestOffer = await getBestOffer(relatedProduct);
        const averageRating = relatedRatingMap[relatedProduct._id.toString()] || 0;
        return { product: relatedProduct, bestOffer, averageRating };
      })
    );

    const totalRelatedProducts = await Product.countDocuments(query);
    const hasMore = totalRelatedProducts > skip + relatedProducts.length;

    res.status(HTTP_STATUS.OK).json({ products: relatedProductsWithOffers, cartItemMap, hasMore });
  } catch (error) {
    next(error);
  }
}

async function loadMoreProducts(req, res, next) {
  try {
    const user = req.session.user || null;
    const cartItemMap = await getCartItemMap(user ? user._id : null);
    const { search, sort, category } = req.query;
    const page = parseInt(req.query.page) || 2;
    const limit = 8;
    const skip = (page - 1) * limit;

    const query = { isListed: true };
    if (category && category !== "all") {
      const categoryDoc = await Category.findById(category);
      if (categoryDoc) query.category = categoryDoc._id;
    }
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    let products = await Product.find(query).skip(skip).limit(limit);

    if (sort) {
      if (sort === "priceLowToHigh") products.sort((a, b) => a.price - b.price);
      else if (sort === "priceHighToLow") products.sort((a, b) => b.price - a.price);
      else if (sort === "aToZ") products.sort((a, b) => a.name.localeCompare(b.name));
      else if (sort === "zToA") products.sort((a, b) => b.name.localeCompare(a.name));
    }

    const ratingMap = await getAverageRatingsForProducts(products);
    const productsWithOffers = await Promise.all(
      products.map(async (product) => {
        const bestOffer = await getBestOffer(product);
        const averageRating = ratingMap[product._id.toString()] || 0;
        return { product, bestOffer, averageRating };
      })
    );

    const totalProducts = await Product.countDocuments(query);
    const hasMore = totalProducts > skip + products.length;

    res.status(HTTP_STATUS.OK).json({ products: productsWithOffers, cartItemMap, hasMore });
  } catch (error) {
    next(error);
  }
}

export {
  getHome,
  getSingleProduct,
  loadMoreRelatedProducts,
  getShopPage,
  loadMoreProducts,
  getAverageRatingsForProducts,
  aggregateProductFrequency,
};
