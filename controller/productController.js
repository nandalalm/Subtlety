import Product from "../model/product.js";
import Category from "../model/category.js";
import Offer from "../model/offer.js";
import path from "path";
import multer from "multer";
import { productStorage } from "../config/cloudinary.js";
import HTTP_STATUS from "../Constants/httpStatus.js";
import MESSAGES from "../Constants/messages.js";

// Initialize multer for products using Cloudinary storage
const productUpload = multer({
  storage: productStorage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|webp/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase()
    );

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(
      new Error(
        MESSAGES.PRODUCT.FILE_TYPE_ERROR + filetypes
      )
    );
  },
});

async function addProduct(req, res, next) {
  try {
    const { name, description, category, price, stock } = req.body;

    // Duplicate name check (case-insensitive)
    const existingProduct = await Product.findOne({
      name: { $regex: new RegExp("^" + name.trim() + "$", "i") },
    });

    if (existingProduct) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: MESSAGES.PRODUCT.ALREADY_EXISTS,
      });
    }

    // Check if images were uploaded (Min 3, Max 8)
    if (!req.files || req.files.length < 3 || req.files.length > 8) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: MESSAGES.PRODUCT.IMAGE_COUNT_ERROR
      });
    }

    const images = req.files.map((file) => file.path);

    const newProduct = new Product({
      name: name.trim(),
      description,
      category,
      price,
      stock,
      images,
    });

    await newProduct.save();
    return res.status(HTTP_STATUS.OK).json({ success: true, message: MESSAGES.PRODUCT.ADDED });
  } catch (error) {
    next(error);
  }
}

async function getProducts(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 4;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";
    const sort = req.query.sort || "latest";

    // Build query
    let query = {};

    if (search) {
      const categories = await Category.find({
        name: { $regex: search, $options: "i" },
      });
      const categoryIds = categories.map((c) => c._id);

      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { category: { $in: categoryIds } },
      ];

      // Match price or stock if search is numeric
      const numSearch = Number(search);
      if (!isNaN(numSearch)) {
        query.$or.push({ price: numSearch }, { stock: numSearch });
      }
    }

    // Apply sort filters
    if (sort === "listed") query.isListed = true;
    if (sort === "unlisted") query.isListed = false;

    // Sort order
    let sortOrder = { createdAt: -1 };
    if (sort === "oldest") sortOrder = { createdAt: 1 };

    const products = await Product.find(query)
      .populate("category")
      .sort(sortOrder)
      .skip(skip)
      .limit(limit);

    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limit);

    const categories = await Category.find();

    res.render("admin/products", {
      products,
      categories,
      currentPage: page,
      totalPages,
      search,
      sort,
      limit,
    });
  } catch (error) {
    next(error);
  }
}

async function getAddProduct(req, res, next) {
  try {
    const categories = await Category.find({ isListed: true });
    res.render("admin/addProduct", { categories });
  } catch (error) {
    next(error);
  }
}

async function getEditProduct(req, res, next) {
  try {
    const { id } = req.params;
    const product = await Product.findById(id).populate("category");
    if (!product) {
      return res.status(HTTP_STATUS.NOT_FOUND).send(MESSAGES.PRODUCT.NOT_FOUND);
    }
    const categories = await Category.find({ isListed: true });
    const page = req.query.page || 1;
    const search = req.query.search || '';
    const sort = req.query.sort || 'latest';
    res.render("admin/editProduct", { product, categories, page, search, sort });
  } catch (error) {
    next(error);
  }
}

async function editProduct(req, res, next) {
  try {
    const { id, name, description, category, price, stock } = req.body;

    // Duplicate name check (case-insensitive, excluding itself)
    const duplicateProduct = await Product.findOne({
      name: { $regex: new RegExp("^" + name.trim() + "$", "i") },
      _id: { $ne: id },
    });

    if (duplicateProduct) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: MESSAGES.PRODUCT.ALREADY_EXISTS,
      });
    }

    const existingProduct = await Product.findById(id);
    if (!existingProduct) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: MESSAGES.PRODUCT.NOT_FOUND });
    }

    // Product Price Validation against active flat offers
    const newPrice = parseFloat(price);
    const existingPrice = existingProduct.price;

    if (newPrice !== existingPrice) {
      // Find active flat offers for this product or its category
      const activeFlatOffers = await Offer.find({
        $or: [
          { targetId: id, offerFor: 'Product' },
          { targetId: category || existingProduct.category, offerFor: 'Category' }
        ],
        offerType: 'flat',
        isActive: true,
        expiresAt: { $gt: new Date() }
      });

      for (const offer of activeFlatOffers) {
        if (newPrice <= offer.value) {
          return res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: `${MESSAGES.PRODUCT.PRICE_OFFER_CONFLICT} (₹${offer.value})`
          });
        }
      }
    }

    // New Slot-based Image Management
    let finalImages = [];
    let imageSlots = [];

    try {
      if (req.body.imageSlots) {
        imageSlots = JSON.parse(req.body.imageSlots);
      }
    } catch (e) {
      console.error(MESSAGES.PRODUCT.SLOTS_PARSE_ERROR, e);
    }

    // Final Validation: 3-8 images
    if (imageSlots.length < 3 || imageSlots.length > 8) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: MESSAGES.PRODUCT.IMAGE_COUNT_ERROR
      });
    }

    // Process slots
    for (const slot of imageSlots) {
      if (slot.type === 'original') {
        // Keep existing image
        finalImages.push(slot.value);
      } else if (slot.type === 'new') {
        // Find the file in req.files
        const file = req.files.find(f => f.fieldname === `newImage_${slot.index}`);
        if (file) {
          finalImages.push(file.path);
        }
      }
    }

    const images = finalImages;

    await Product.findByIdAndUpdate(
      id,
      {
        name: name.trim(),
        description,
        category,
        price,
        stock,
        images,
      },
      { new: true, runValidators: true }
    );

    return res.status(HTTP_STATUS.OK).json({ success: true, message: MESSAGES.PRODUCT.UPDATED });
  } catch (error) {
    next(error);
  }
}

async function toggleProductStatus(req, res, next) {
  const productId = req.params.id;
  const { isListed } = req.body;

  try {
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ message: MESSAGES.PRODUCT.NOT_FOUND });
    }

    // Toggle isListed based on the incoming value
    product.isListed = !isListed;
    await product.save();

    return res
      .status(HTTP_STATUS.OK)
      .json({ message: MESSAGES.PRODUCT.STATUS_UPDATED, isListed: product.isListed });
  } catch (error) {
    next(error);
  }
}

export {
  addProduct,
  getProducts,
  getAddProduct,
  getEditProduct,
  editProduct,
  toggleProductStatus,
  productUpload,
};
