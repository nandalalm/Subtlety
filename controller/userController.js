import userService from "../services/userService.js";
import { getCartItemMap } from "../utils/helper.js";
import HTTP_STATUS from "../Constants/httpStatus.js";
import MESSAGES from "../Constants/messages.js";

async function getHome(req, res, next) {
  try {
    const user = req.session.user || null;
    const cartItemMap = await getCartItemMap(user ? user._id : null);
    
    const data = await userService.getHomeData();

    res.render("user/home", {
      user,
      cartItemMap,
      ...data
    });
  } catch (error) {
    next(error);
  }
}

async function getShopPage(req, res, next) {
  try {
    const user = req.session.user || null;
    const cartItemMap = await getCartItemMap(user ? user._id : null);
    const { search, sort, category, page = 1, limit = 8 } = req.query;

    const data = await userService.getShopData({ 
      search, 
      sort, 
      category, 
      page: parseInt(page),
      limit: parseInt(limit)
    });
    
    if (req.query.ajax) {
      res.set('X-Has-More', data.hasMore.toString());
      if (req.query.append) {
        return res.render("partials/User/productGridAppend", {
          ...data,
          user,
          cartItemMap
        });
      }
      return res.render("partials/User/productGrid", {
        ...data,
        search,
        sort,
        category,
        user,
        cartItemMap,
        currentPage: parseInt(page),
        limit: parseInt(limit)
      });
    }

    res.render("user/shop", {
      ...data,
      search,
      sort,
      category,
      user,
      cartItemMap,
      currentPage: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    next(error);
  }
}

async function getSingleProduct(req, res, next) {
  const { id } = req.params;
  try {
    const user = req.session.user || null;
    const cartItemMap = await getCartItemMap(user ? user._id : null);
    
    const data = await userService.getProductDetails(id);
    if (!data) {
      return res.status(HTTP_STATUS.NOT_FOUND).send(MESSAGES.USER.PRODUCT_NOT_FOUND);
    }

    const { product } = data;
    const categoryName = product.category ? product.category.name : "Uncategorized";
    const discountedPrice = data.bestOffer ? data.bestOffer.discountedPrice : product.price;

    res.render("user/single-product", {
      user,
      cartItemMap,
      ...data,
      categoryName,
      discountedPrice,
      currentPage: 1
    });
  } catch (error) {
    next(error);
  }
}

async function loadMoreRelatedProducts(req, res, next) {
  try {
    const user = req.session.user || null;
    const cartItemMap = await getCartItemMap(user ? user._id : null);
    const { productId, categoryId, page = 2 } = req.query;

    const data = await userService.getMoreRelatedProducts(productId, categoryId, parseInt(page));

    res.status(HTTP_STATUS.OK).json({ ...data, cartItemMap });
  } catch (error) {
    next(error);
  }
}

async function loadMoreProducts(req, res, next) {
  try {
    const user = req.session.user || null;
    const cartItemMap = await getCartItemMap(user ? user._id : null);
    const { search, sort, category, page = 2 } = req.query;

    const data = await userService.getShopData({ search, sort, category, page: parseInt(page) });

    res.status(HTTP_STATUS.OK).json({ products: data.productsWithOffers, cartItemMap, hasMore: data.hasMore });
  } catch (error) {
    next(error);
  }
}

async function getSectionReplacement(req, res, next) {
  try {
    const user = req.session.user || null;
    const cartItemMap = await getCartItemMap(user ? user._id : null);
    const { section, productId, categoryId, exclude = "" } = req.query;
    const excludeProductIds = exclude
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    const data = await userService.getSectionReplacement({
      section,
      productId,
      categoryId,
      excludeProductIds
    });

    if (!data.products.length) {
      return res.status(HTTP_STATUS.OK).json({ success: true, html: "", hasMore: false });
    }

    const replacement = data.products[0];
    return res.render("partials/User/productCard", {
      product: replacement.product,
      bestOffer: replacement.bestOffer,
      averageRating: replacement.averageRating,
      cartItemMap
    }, (error, html) => {
      if (error) return next(error);
      res.status(HTTP_STATUS.OK).json({ success: true, html, hasMore: data.hasMore });
    });
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
  getSectionReplacement
};
