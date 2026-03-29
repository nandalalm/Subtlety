import userRepository from "../repositories/userRepository.js";
import productRepository from "../repositories/productRepository.js";
import categoryRepository from "../repositories/categoryRepository.js";
import { getBestOffer, getAverageRatingsForProducts } from "../utils/helper.js";
import MESSAGES from "../Constants/messages.js";

const wishlistService = {
  getWishlistData: async (userId, page = 1) => {
    const limit = 4;
    const skip = (page - 1) * limit;

    const userDoc = await userRepository.findById(userId);
    if (!userDoc) throw { statusCode: 404, message: MESSAGES.PROFILE.USER_NOT_FOUND };

    const totalWishlisted = await productRepository.countDocuments({
      _id: { $in: userDoc.wishlisted },
      isListed: true
    });

    const userWithWishlist = await userRepository.findByIdWithPopulate(userId, {
      path: "wishlisted",
      match: { isListed: true },
      options: { skip, limit }
    });

    const categories = await categoryRepository.find({});
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
      categories,
      totalPages: Math.ceil(totalWishlisted / limit) || 1
    };
  },

  addToWishlist: async (userId, productId) => {
    const user = await userRepository.findById(userId);
    if (!user) throw { statusCode: 404, message: MESSAGES.PROFILE.USER_NOT_FOUND };

    if (user.wishlisted.includes(productId)) {
      throw { statusCode: 400, message: MESSAGES.WISHLIST.ALREADY_IN_WISHLIST };
    }

    user.wishlisted.push(productId);
    return await user.save();
  },

  removeFromWishlist: async (userId, productId) => {
    const user = await userRepository.findById(userId);
    if (!user) throw { statusCode: 404, message: MESSAGES.PROFILE.USER_NOT_FOUND };

    const index = user.wishlisted.indexOf(productId);
    if (index === -1) throw { statusCode: 400, message: MESSAGES.WISHLIST.NOT_FOUND };

    user.wishlisted.splice(index, 1);
    return await user.save();
  }
};

export default wishlistService;
