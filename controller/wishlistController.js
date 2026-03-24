import User from "../model/user.js";
import Product from "../model/product.js";
import Category from "../model/category.js";
import { getCartItemMap, getBestOffer, getAverageRatingsForProducts } from "../utils/helper.js";
import MESSAGES from "../Constants/messages.js";
import HTTP_STATUS from "../Constants/httpStatus.js";


async function getWishlist(req, res, next) {
  try {
    const userId = req.session.user._id;
    const cartItemMap = await getCartItemMap(userId);
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const skip = (page - 1) * limit;

    // First, find the user to get all wishlisted product IDs that are listed
    const userDoc = await User.findById(userId);
    if (!userDoc) {
      return res.status(HTTP_STATUS.NOT_FOUND).send(MESSAGES.PROFILE.USER_NOT_FOUND);
    }

    // Get the total count of listed products in wishlist
    const totalWishlisted = await Product.countDocuments({
      _id: { $in: userDoc.wishlisted },
      isListed: true
    });
    const totalPages = Math.ceil(totalWishlisted / limit);

    // Now populate with pagination
    const user = await User.findById(userId).populate({
      path: "wishlisted",
      match: { isListed: true },
      options: { skip, limit }
    });

    const categories = await Category.find({});

    const ratingMap = await getAverageRatingsForProducts(user.wishlisted);
    const productsWithOffers = await Promise.all(
      user.wishlisted.map(async (product) => {
        const bestOffer = await getBestOffer(product);
        const averageRating = ratingMap[product._id.toString()] || 0;
        return { product, bestOffer, averageRating };
      })
    );

    res.render("user/wishlist", {
      products: productsWithOffers,
      user,
      cartItemMap,
      categories,
      currentPage: page,
      totalPages: totalPages || 1
    });
  } catch (error) {
    next(error);
  }
}

async function addToWishlist(req, res, next) {
  const { userId, productId } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ message: MESSAGES.PROFILE.USER_NOT_FOUND });
    }

    // Check if product is already in the wishlist
    if (user.wishlisted.includes(productId)) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json({ message: MESSAGES.WISHLIST.ALREADY_IN_WISHLIST });
    }

    // Add the product to the wishlist
    user.wishlisted.push(productId);
    await user.save();

    res.status(HTTP_STATUS.OK).json({ message: MESSAGES.WISHLIST.ADD_SUCCESS });
  } catch (error) {
    next(error);
  }
}

async function deleteFromWishlist(req, res, next) {
  const { userId } = req.body;
  const { productId } = req.params;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ message: MESSAGES.PROFILE.USER_NOT_FOUND });
    }

    // Check if the product is in the wishlist
    const productIndex = user.wishlisted.indexOf(productId);
    if (productIndex === -1) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json({ message: MESSAGES.WISHLIST.NOT_FOUND });
    }

    // Remove the product from the wishlist
    user.wishlisted.splice(productIndex, 1);
    await user.save();

    res.status(HTTP_STATUS.OK).json({ message: MESSAGES.WISHLIST.REMOVE_SUCCESS });
  } catch (error) {
    next(error);
  }
}

export {
  getWishlist,
  addToWishlist,
  deleteFromWishlist
};
