import path from "path";
import HTTP_STATUS from "../Constants/httpStatus.js";
import MESSAGES from "../Constants/messages.js";
import Category from "../model/category.js";
import multer from "multer";
import { categoryStorage } from "../config/cloudinary.js";

// Initialize multer for categories using Cloudinary storage
const categoryUpload = multer({
  storage: categoryStorage,
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
        MESSAGES.CATEGORY.FILE_TYPE_ERROR + filetypes
      )
    );
  },
});

async function getCategories(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";
    const sort = req.query.sort || "";

    // Build query
    const query = {};
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    // Apply sort filters
    let sortOrder = { createdAt: -1 }; // Default: Latest
    if (sort === "oldest") sortOrder = { createdAt: 1 };
    if (sort === "listed") query.isListed = true;
    if (sort === "unlisted") query.isListed = false;

    // Fetch the categories with pagination and sort
    const categories = await Category.find(query).sort(sortOrder).skip(skip).limit(limit);
    const totalCategories = await Category.countDocuments(query);
    const totalPages = Math.ceil(totalCategories / limit);

    res.render("admin/categories", {
      categories,
      currentPage: page,
      totalPages,
      limit,
      search,
      sort,
      admin: req.session.admin
    });
  } catch (error) {
    next(error);
  }
}

let ongoingRequests = new Set();

async function addCategory(req, res, next) {
  const { name, isListed } = req.body;

  if (!req.file) {
    return res
      .status(HTTP_STATUS.BAD_REQUEST)
      .json({ status: false, message: MESSAGES.CATEGORY.NO_IMAGE });
  }

  // Check if the request is already being processed
  const requestKey = `${name}_${isListed}`;

  if (ongoingRequests.has(requestKey)) {
    return res
      .status(HTTP_STATUS.CONFLICT)
      .json({ status: false, message: MESSAGES.CATEGORY.DUPLICATE_REQUEST });
  }

  ongoingRequests.add(requestKey);

  try {
    // Check if a category with the same name already exists
    const existingCategory = await Category.findOne({ name });
    if (existingCategory) {
      ongoingRequests.delete(requestKey);
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json({ status: false, message: MESSAGES.CATEGORY.ALREADY_EXISTS });
    }

    // If not, create a new category
    const category = new Category({
      name,
      image: req.file.path,
      isListed: isListed === "true",
    });

    await category.save();
    return res
      .status(HTTP_STATUS.OK)
      .json({ status: true, message: MESSAGES.CATEGORY.ADDED });
  } catch (error) {
    next(error);
  } finally {
    // Clean up the request key after the operation
    ongoingRequests.delete(requestKey);
  }
}

async function editCategory(req, res, next) {
  const { name, isListed } = req.body;
  const id = req.params.id;
  const updates = {
    name,
    isListed: isListed === "true",
  };

  if (req.file) {
    updates.image = req.file.path;
  }

  try {
    // Check if a category with the same name already exists excluding the current category
    const existingCategory = await Category.findOne({
      name: name,
      _id: { $ne: id },
    });
    if (existingCategory) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json({ status: false, message: MESSAGES.CATEGORY.NAME_EXISTS });
    }

    const updatedCategory = await Category.findByIdAndUpdate(id, updates, {
      new: true,
    });
    if (!updatedCategory) {
      return res
        .status(HTTP_STATUS.NOT_FOUND)
        .json({ status: false, message: MESSAGES.CATEGORY.NOT_FOUND });
    }
    res
      .status(HTTP_STATUS.OK)
      .json({ status: true, message: MESSAGES.CATEGORY.UPDATED });
  } catch (error) {
    next(error);
  }
}

async function toggleCategoryStatus(req, res, next) {
  const categoryId = req.params.id;

  try {
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(HTTP_STATUS.NOT_FOUND).send(MESSAGES.CATEGORY.NOT_FOUND);
    }

    // Toggle the isListed status
    category.isListed = !category.isListed;
    await category.save();

    res.status(HTTP_STATUS.OK).send(MESSAGES.CATEGORY.STATUS_UPDATED);
  } catch (error) {
    next(error);
  }
}

export {
  getCategories,
  addCategory,
  editCategory,
  toggleCategoryStatus,
  categoryUpload,
};
