import path from "path";
import HTTP_STATUS from "../Constants/httpStatus.js";
import MESSAGES from "../Constants/messages.js";
import categoryService from "../services/categoryService.js";
import multer from "multer";
import { categoryStorage } from "../config/cloudinary.js";

// Initialize multer for categories using Cloudinary storage
const categoryUpload = multer({
  storage: categoryStorage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|webp/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error(MESSAGES.CATEGORY.FILE_TYPE_ERROR + filetypes));
  },
});

async function getCategories(req, res, next) {
  try {
    const queryParams = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 5,
      search: req.query.search || "",
      sort: req.query.sort || ""
    };

    const data = await categoryService.getCategories(queryParams);

    if (req.query.ajax) {
      return res.render("partials/Admin/categoryTable", {
        ...data,
        currentPage: queryParams.page,
        limit: queryParams.limit,
        search: queryParams.search,
        sort: queryParams.sort
      });
    }

    res.render("admin/categories", {
      ...data,
      currentPage: queryParams.page,
      limit: queryParams.limit,
      search: queryParams.search,
      sort: queryParams.sort,
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
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ status: false, message: MESSAGES.CATEGORY.NO_IMAGE });
  }

  const requestKey = `${name}_${isListed}`;
  if (ongoingRequests.has(requestKey)) {
    return res.status(HTTP_STATUS.CONFLICT).json({ status: false, message: MESSAGES.CATEGORY.DUPLICATE_REQUEST });
  }

  ongoingRequests.add(requestKey);

  try {
    await categoryService.addCategory({
      name,
      image: req.file.path,
      isListed: isListed === "true",
    });
    return res.status(HTTP_STATUS.OK).json({ status: true, message: MESSAGES.CATEGORY.ADDED });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ status: false, message: error.message });
    }
    next(error);
  } finally {
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
    await categoryService.updateCategory(id, updates);
    res.status(HTTP_STATUS.OK).json({ status: true, message: MESSAGES.CATEGORY.UPDATED });
  } catch (error) {
    if (error.statusCode === 400 || error.statusCode === 404) {
      return res.status(error.statusCode).json({ status: false, message: error.message });
    }
    next(error);
  }
}

async function toggleCategoryStatus(req, res, next) {
  const categoryId = req.params.id;
  try {
    const updatedCategory = await categoryService.toggleStatus(categoryId);
    res.status(HTTP_STATUS.OK).json({ 
      success: true, 
      message: MESSAGES.CATEGORY.STATUS_UPDATED,
      category: updatedCategory
    });
  } catch (error) {
    if (error.statusCode === 404) return res.status(HTTP_STATUS.NOT_FOUND).send(error.message);
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
