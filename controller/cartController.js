import cartService from "../services/cartService.js";
import HTTP_STATUS from "../Constants/httpStatus.js";
import MESSAGES from "../Constants/messages.js";

async function getCart(req, res, next) {
  const userId = req.session.user._id;
  try {
    const data = await cartService.getCart(userId);
    res.status(HTTP_STATUS.OK).render("user/cart", {
      user: req.session.user,
      cart: data
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
  try {
    await cartService.addToCart(user, productId, quantity);
    const totals = await cartService.getCartTotals(user);
    return res.status(HTTP_STATUS.OK).json({ message: MESSAGES.CART.ITEM_ADDED, newQuantity: quantity, ...totals });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.BAD_REQUEST || error.statusCode === HTTP_STATUS.NOT_FOUND) {
      return res.status(error.statusCode).json({
        status: error.status || (
          error.message === MESSAGES.CART.OUT_OF_STOCK ? 'out-of-stock' :
          error.message === MESSAGES.CART.PRODUCT_UNLISTED ? 'unlisted' :
          error.message === MESSAGES.CART.CATEGORY_UNLISTED ? 'category-unlisted' :
          'error'
        ),
        message: error.message
      });
    }
    next(error);
  }
}

async function removeFromCart(req, res, next) {
  const userId = req.session.user._id;
  const { productId } = req.body;
  try {
    const data = await cartService.removeFromCart(userId, productId);
    return res.status(HTTP_STATUS.OK).json({
      message: MESSAGES.CART.ITEM_REMOVED,
      ...data
    });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.NOT_FOUND) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ message: error.message });
    }
    next(error);
  }
}

async function updateQuantity(req, res, next) {
  const userId = req.session.user._id;
  const { productId, quantity } = req.body;
  try {
    const data = await cartService.updateQuantity(userId, productId, parseInt(quantity));
    return res.status(HTTP_STATUS.OK).json({
      message: data.message || MESSAGES.CART.QUANTITY_UPDATED,
      ...data
    });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.BAD_REQUEST || error.statusCode === HTTP_STATUS.NOT_FOUND) {
      return res.status(error.statusCode).json({
        status: error.status || (
          error.message === MESSAGES.CART.PRODUCT_UNLISTED ? 'unlisted' :
          error.message === MESSAGES.CART.CATEGORY_UNLISTED ? 'category-unlisted' :
          error.message === MESSAGES.CART.OUT_OF_STOCK ? 'out-of-stock' :
          'error'
        ),
        message: error.message
      });
    }
    next(error);
  }
}

export {
  getCart,
  addToCart,
  removeFromCart,
  updateQuantity
};
