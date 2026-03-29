import wishlistService from "../services/wishlistService.js";
import { getCartItemMap } from "../utils/helper.js";
import HTTP_STATUS from "../Constants/httpStatus.js";
import MESSAGES from "../Constants/messages.js";

async function getWishlist(req, res, next) {
  try {
    const userId = req.session.user._id;
    const cartItemMap = await getCartItemMap(userId);
    const page = parseInt(req.query.page) || 1;

    const data = await wishlistService.getWishlistData(userId, page);

    if (req.query.ajax) {
      return res.render("partials/User/wishlistGrid", {
        ...data,
        cartItemMap,
        currentPage: page
      });
    }

    res.render("user/wishlist", {
      ...data,
      cartItemMap,
      user: req.session.user,
      currentPage: page
    });
  } catch (error) {
    if (error.statusCode === 404) return res.status(HTTP_STATUS.NOT_FOUND).send(error.message);
    next(error);
  }
}

async function addToWishlist(req, res, next) {
  const { productId } = req.body;
  const userId = req.session.user._id;

  try {
    await wishlistService.addToWishlist(userId, productId);
    res.status(HTTP_STATUS.OK).json({ message: MESSAGES.WISHLIST.ADD_SUCCESS });
  } catch (error) {
    if (error.statusCode === 400 || error.statusCode === 404) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    next(error);
  }
}

async function deleteFromWishlist(req, res, next) {
  const userId = req.session.user._id;
  const { productId } = req.params;

  try {
    await wishlistService.removeFromWishlist(userId, productId);
    res.status(HTTP_STATUS.OK).json({ message: MESSAGES.WISHLIST.REMOVE_SUCCESS });
  } catch (error) {
    if (error.statusCode === 400 || error.statusCode === 404) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    next(error);
  }
}

export {
  getWishlist,
  addToWishlist,
  deleteFromWishlist
};
