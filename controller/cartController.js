import cartService from "../services/cartService.js";
import HTTP_STATUS from "../Constants/httpStatus.js";
import MESSAGES from "../Constants/messages.js";

class CartController {
async getCart(req, res, next) {
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

async addToCart(req, res, next) {
  const { user, productId, quantity } = req.body;
  if (!user) {
    return next({ statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.CART.USER_REQUIRED });
  }
  try {
    await cartService.addToCart(user, productId, quantity);
    const totals = await cartService.getCartTotals(user);
    return res.status(HTTP_STATUS.OK).json({ message: MESSAGES.CART.ITEM_ADDED, newQuantity: quantity, ...totals });
  } catch (error) {
    error.status = error.status || (
      error.message === MESSAGES.CART.OUT_OF_STOCK ? 'out-of-stock' :
      error.message === MESSAGES.CART.PRODUCT_UNLISTED ? 'unlisted' :
      error.message === MESSAGES.CART.CATEGORY_UNLISTED ? 'category-unlisted' :
      'error'
    );
    next(error);
  }
}

async removeFromCart(req, res, next) {
  const userId = req.session.user._id;
  const { productId } = req.body;
  try {
    const data = await cartService.removeFromCart(userId, productId);
    return res.status(HTTP_STATUS.OK).json({
      message: MESSAGES.CART.ITEM_REMOVED,
      ...data
    });
  } catch (error) {
    next(error);
  }
}

async updateQuantity(req, res, next) {
  const userId = req.session.user._id;
  const { productId, quantity } = req.body;
  try {
    const data = await cartService.updateQuantity(userId, productId, parseInt(quantity));
    return res.status(HTTP_STATUS.OK).json({
      message: data.message || MESSAGES.CART.QUANTITY_UPDATED,
      ...data
    });
  } catch (error) {
    error.status = error.status || (
      error.message === MESSAGES.CART.PRODUCT_UNLISTED ? 'unlisted' :
      error.message === MESSAGES.CART.CATEGORY_UNLISTED ? 'category-unlisted' :
      error.message === MESSAGES.CART.OUT_OF_STOCK ? 'out-of-stock' :
      error.message.startsWith(MESSAGES.CART.LOW_STOCK_PREFIX) ? 'low-stock' :
      'error'
    );
    next(error);
  }
}
}

const cartController = new CartController();

const getCart = cartController.getCart.bind(cartController);
const addToCart = cartController.addToCart.bind(cartController);
const removeFromCart = cartController.removeFromCart.bind(cartController);
const updateQuantity = cartController.updateQuantity.bind(cartController);

export {
  getCart,
  addToCart,
  removeFromCart,
  updateQuantity
};
