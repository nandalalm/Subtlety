import userRepository from "../repositories/userRepository.js";
import productRepository from "../repositories/productRepository.js";
import categoryRepository from "../repositories/categoryRepository.js";
import { getBestOffer, getAverageRatingsForProducts } from "../utils/helper.js";
import MESSAGES from "../Constants/messages.js";
import HTTP_STATUS from "../Constants/httpStatus.js";

const wishlistService = {
  getWishlistData: async (userId, page = 1) => {
    const limit = 4;

    const userDoc = await userRepository.findById(userId);
    if (!userDoc) throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.PROFILE.USER_NOT_FOUND };
    const listedCategories = await categoryRepository.find({ isListed: true });
    const listedCategoryIds = listedCategories.map((category) => category._id);

    const totalWishlisted = await productRepository.countDocuments({
      _id: { $in: userDoc.wishlisted },
      isListed: true,
      category: { $in: listedCategoryIds }
    });

    const totalPages = Math.max(1, Math.ceil(totalWishlisted / limit));
    const currentPage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
    const skip = (currentPage - 1) * limit;

    const userWithWishlist = await userRepository.findByIdWithPopulate(userId, {
      path: "wishlisted",
      match: { isListed: true, category: { $in: listedCategoryIds } },
      options: { skip, limit }
    });

    const ratingMap = await getAverageRatingsForProducts(userWithWishlist.wishlisted);
    
    const productsWithOffers = await Promise.all(
      userWithWishlist.wishlisted.map(async (product) => {
        const bestOffer = await getBestOffer(product);
        const averageRating = ratingMap[product._id.toString()] || 0;
        return { product, bestOffer, averageRating };
      })
    );

    return {
      products: productsWithOffers,
      user: userWithWishlist,
      categories: listedCategories,
      totalPages,
      currentPage
    };
  },

  addToWishlist: async (userId, productId) => {
    const user = await userRepository.findById(userId);
    if (!user) throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.PROFILE.USER_NOT_FOUND };

    const product = await productRepository.findByIdAndPopulate(productId, "category");
    if (!product) throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.CART.PRODUCT_NOT_FOUND, status: "unlisted" };
    if (!product.isListed) throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.CART.PRODUCT_UNLISTED, status: "unlisted" };
    if (!product.category || product.category.isListed === false) {
      throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.CART.CATEGORY_UNLISTED, status: "category-unlisted" };
    }

    if (user.wishlisted.includes(productId)) {
      throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.WISHLIST.ALREADY_IN_WISHLIST };
    }

    user.wishlisted.push(productId);
    return await user.save();
  },

  removeFromWishlist: async (userId, productId) => {
    const user = await userRepository.findById(userId);
    if (!user) throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.PROFILE.USER_NOT_FOUND };

    const index = user.wishlisted.indexOf(productId);
    if (index === -1) throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.WISHLIST.NOT_FOUND };

    user.wishlisted.splice(index, 1);
    return await user.save();
  }
};

export default wishlistService;
