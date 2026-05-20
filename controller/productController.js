import productService from "../services/productService.js";
import categoryService from "../services/categoryService.js";
import HTTP_STATUS from "../Constants/httpStatus.js";
import MESSAGES from "../Constants/messages.js";

class ProductController {
async addProduct(req, res, next) {
  try {
    const { name, description, category, price, stock } = req.body;

    if (!req.files || req.files.length < 3 || req.files.length > 8) {
      return next({ statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.PRODUCT.IMAGE_COUNT_ERROR });
    }

    const images = req.files.map((file) => file.path);
    await productService.addProduct({
      name: name.trim(),
      description,
      category,
      price,
      stock,
      images,
    });

    return res.status(HTTP_STATUS.OK).json({ success: true, message: MESSAGES.PRODUCT.ADDED });
  } catch (error) {
    next(error);
  }
}

async getProducts(req, res, next) {
  try {
    const queryParams = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 5,
      search: req.query.search || "",
      sort: req.query.sort || "latest"
    };

    const data = await productService.getAdminProducts(queryParams);

    if (req.query.ajax) {
      return res.render("partials/Admin/productTable", {
        ...data,
        currentPage: queryParams.page,
        search: queryParams.search,
        sort: queryParams.sort,
        limit: queryParams.limit,
      });
    }

    res.render("admin/products", {
      ...data,
      currentPage: queryParams.page,
      search: queryParams.search,
      sort: queryParams.sort,
      limit: queryParams.limit,
    });
  } catch (error) {
    next(error);
  }
}

async getAddProduct(req, res, next) {
  try {
    const data = await categoryService.getCategories({ limit: 1000 });
    res.render("admin/addProduct", { categories: data.categories.filter(c => c.isListed) });
  } catch (error) {
    next(error);
  }
}

async getEditProduct(req, res, next) {
  try {
    const { id } = req.params;
    const product = await productService.getAdminProductDetail(id); 
    const categoriesData = await categoryService.getCategories({ limit: 1000 });
    
    res.render("admin/editProduct", { 
      product, 
      categories: categoriesData.categories.filter(c => c.isListed), 
      page: req.query.page || 1, 
      search: req.query.search || '', 
      sort: req.query.sort || 'latest' 
    });
  } catch (error) {
    next(error);
  }
}

async getProductView(req, res, next) {
  try {
    const product = await productService.getAdminProductDetail(req.params.id);
    const backQuery = `page=${req.query.page || 1}&search=${encodeURIComponent(req.query.search || "")}&sort=${req.query.sort || "latest"}`;
    res.render("admin/productView", { product, backQuery });
  } catch (error) {
    next(error);
  }
}

async editProduct(req, res, next) {
  try {
    const { id, name, description, category, price, stock } = req.body;
    let imageSlots = [];
    try {
      if (req.body.imageSlots) imageSlots = JSON.parse(req.body.imageSlots);
    } catch (e) {
      return next({ statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.PRODUCT.SLOTS_PARSE_ERROR });
    }

    if (imageSlots.length < 3 || imageSlots.length > 8) {
      return next({ statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.PRODUCT.IMAGE_COUNT_ERROR });
    }

    let finalImages = [];
    for (const slot of imageSlots) {
      if (slot.type === 'original') finalImages.push(slot.value);
      else if (slot.type === 'new') {
        const file = req.files.find(f => f.fieldname === `newImage_${slot.index}`);
        if (file) finalImages.push(file.path);
      }
    }

    await productService.updateProduct(id, {
      name: name.trim(),
      description,
      category,
      price,
      stock,
      images: finalImages,
    });

    return res.status(HTTP_STATUS.OK).json({ success: true, message: MESSAGES.PRODUCT.UPDATED });
  } catch (error) {
    next(error);
  }
}

async toggleProductStatus(req, res, next) {
  const productId = req.params.id;
  try {
    const product = await productService.toggleStatus(productId);
    return res.status(HTTP_STATUS.OK).json({ 
      success: true,
      message: MESSAGES.PRODUCT.STATUS_UPDATED, 
      product: product
    });
  } catch (error) {
    next(error);
  }
}
}

const productController = new ProductController();

const addProduct = productController.addProduct.bind(productController);
const getProducts = productController.getProducts.bind(productController);
const getAddProduct = productController.getAddProduct.bind(productController);
const getEditProduct = productController.getEditProduct.bind(productController);
const getProductView = productController.getProductView.bind(productController);
const editProduct = productController.editProduct.bind(productController);
const toggleProductStatus = productController.toggleProductStatus.bind(productController);

export {
  addProduct,
  getProducts,
  getAddProduct,
  getEditProduct,
  getProductView,
  editProduct,
  toggleProductStatus
};
