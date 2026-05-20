import HTTP_STATUS from "../Constants/httpStatus.js";
import MESSAGES from "../Constants/messages.js";
import categoryService from "../services/categoryService.js";

class CategoryController {
async getCategories(req, res, next) {
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

async getAddCategoryPage(req, res, next) {
  try {
    res.render("admin/categoryForm", {
      category: null,
      mode: "add",
      backQuery: `page=${req.query.page || 1}&search=${encodeURIComponent(req.query.search || "")}&sort=${req.query.sort || "latest"}`
    });
  } catch (error) {
    next(error);
  }
}

async getEditCategoryPage(req, res, next) {
  try {
    const category = await categoryService.getCategoryById(req.params.id);
    res.render("admin/categoryForm", {
      category,
      mode: "edit",
      backQuery: `page=${req.query.page || 1}&search=${encodeURIComponent(req.query.search || "")}&sort=${req.query.sort || "latest"}`
    });
  } catch (error) {
    next(error);
  }
}

async addCategory(req, res, next) {
  const { name, isListed } = req.body;

  if (!req.file) {
    return next({ statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.CATEGORY.NO_IMAGE, statusFlag: false });
  }

  try {
    await categoryService.addCategory({
      name,
      image: req.file.path,
      isListed: isListed === "true",
    });
    return res.status(HTTP_STATUS.OK).json({ status: true, message: MESSAGES.CATEGORY.ADDED });
  } catch (error) {
    error.statusFlag = false;
    next(error);
  }
}

async editCategory(req, res, next) {
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
    error.statusFlag = false;
    next(error);
  }
}

async toggleCategoryStatus(req, res, next) {
  const categoryId = req.params.id;
  try {
    const updatedCategory = await categoryService.toggleStatus(categoryId);
    res.status(HTTP_STATUS.OK).json({ 
      success: true, 
      message: MESSAGES.CATEGORY.STATUS_UPDATED,
      category: updatedCategory
    });
  } catch (error) {
    next(error);
  }
}
}

const categoryController = new CategoryController();

const getCategories = categoryController.getCategories.bind(categoryController);
const getAddCategoryPage = categoryController.getAddCategoryPage.bind(categoryController);
const getEditCategoryPage = categoryController.getEditCategoryPage.bind(categoryController);
const addCategory = categoryController.addCategory.bind(categoryController);
const editCategory = categoryController.editCategory.bind(categoryController);
const toggleCategoryStatus = categoryController.toggleCategoryStatus.bind(categoryController);

export {
  getCategories,
  getAddCategoryPage,
  getEditCategoryPage,
  addCategory,
  editCategory,
  toggleCategoryStatus
};
