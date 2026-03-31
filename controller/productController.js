import productService from "../services/productService.js";
import categoryService from "../services/categoryService.js";
import path from "path";
import multer from "multer";
import { productStorage } from "../config/cloudinary.js";
import HTTP_STATUS from "../Constants/httpStatus.js";
import MESSAGES from "../Constants/messages.js";

const productUpload = multer({
  storage: productStorage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|webp/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error(MESSAGES.PRODUCT.FILE_TYPE_ERROR + filetypes));
  },
});

async function addProduct(req, res, next) {
  try {
    const { name, description, category, price, stock } = req.body;

    if (!req.files || req.files.length < 3 || req.files.length > 8) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.PRODUCT.IMAGE_COUNT_ERROR });
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
    if (error.statusCode === HTTP_STATUS.BAD_REQUEST) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: error.message });
    }
    next(error);
  }
}

async function getProducts(req, res, next) {
  try {
    const queryParams = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 4,
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

async function getAddProduct(req, res, next) {
  try {
    const data = await categoryService.getCategories({ limit: 1000 }); // Get all listed categories
    res.render("admin/addProduct", { categories: data.categories.filter(c => c.isListed) });
  } catch (error) {
    next(error);
  }
}

async function getEditProduct(req, res, next) {
  try {
    const { id } = req.params;
    const data = await productService.getAdminProducts({ page: 1, limit: 1, search: id }); 
    const product = await productService.updateProduct(id, {}); 
    const categoriesData = await categoryService.getCategories({ limit: 1000 });
    
    res.render("admin/editProduct", { 
      product, 
      categories: categoriesData.categories.filter(c => c.isListed), 
      page: req.query.page || 1, 
      search: req.query.search || '', 
      sort: req.query.sort || 'latest' 
    });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.NOT_FOUND) return res.status(HTTP_STATUS.NOT_FOUND).send(error.message);
    next(error);
  }
}

async function getProductView(req, res, next) {
  try {
    const product = await productService.getAdminProductDetail(req.params.id);
    const backQuery = `page=${req.query.page || 1}&search=${encodeURIComponent(req.query.search || "")}&sort=${req.query.sort || "latest"}`;
    res.render("admin/productView", { product, backQuery });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.NOT_FOUND) return res.status(HTTP_STATUS.NOT_FOUND).render("404", { message: error.message });
    next(error);
  }
}

async function editProduct(req, res, next) {
  try {
    const { id, name, description, category, price, stock } = req.body;
    let imageSlots = [];
    try {
      if (req.body.imageSlots) imageSlots = JSON.parse(req.body.imageSlots);
    } catch (e) {
      console.error(MESSAGES.PRODUCT.SLOTS_PARSE_ERROR, e);
    }

    if (imageSlots.length < 3 || imageSlots.length > 8) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.PRODUCT.IMAGE_COUNT_ERROR });
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
    if (error.statusCode === HTTP_STATUS.BAD_REQUEST || error.statusCode === HTTP_STATUS.NOT_FOUND) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
}

async function toggleProductStatus(req, res, next) {
  const productId = req.params.id;
  try {
    const product = await productService.toggleStatus(productId);
    return res.status(HTTP_STATUS.OK).json({ 
      success: true,
      message: MESSAGES.PRODUCT.STATUS_UPDATED, 
      product: product
    });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.NOT_FOUND) return res.status(HTTP_STATUS.NOT_FOUND).json({ message: error.message });
    next(error);
  }
}

export {
  addProduct,
  getProducts,
  getAddProduct,
  getEditProduct,
  getProductView,
  editProduct,
  toggleProductStatus,
  productUpload,
};
