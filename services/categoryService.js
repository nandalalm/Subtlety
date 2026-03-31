import categoryRepository from "../repositories/categoryRepository.js";
import MESSAGES from "../Constants/messages.js";
import HTTP_STATUS from "../Constants/httpStatus.js";

const categoryService = {
  getCategories: async (queryParams) => {
    const { page = 1, limit = 5, search = "", sort = "latest" } = queryParams;
    const skip = (page - 1) * limit;

    let query = {};
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    if (sort === "listed") query.isListed = true;
    else if (sort === "unlisted") query.isListed = false;

    let sortOrder = { createdAt: -1 };
    if (sort === "oldest") sortOrder = { createdAt: 1 };

    const categories = await categoryRepository.find(query, sortOrder, skip, limit);
    const totalCategories = await categoryRepository.countDocuments(query);

    return {
      categories,
      totalPages: Math.ceil(totalCategories / limit),
      totalCategories,
      limit
    };
  },

  addCategory: async (categoryData) => {
    const existing = await categoryRepository.findOne({ name: { $regex: `^${categoryData.name.trim()}$`, $options: "i" } });
    if (existing) {
      throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.CATEGORY.ALREADY_EXISTS };
    }
    return await categoryRepository.save(categoryData);
  },

  updateCategory: async (id, updateData) => {
    const category = await categoryRepository.findById(id);
    if (!category) {
      throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.CATEGORY.NOT_FOUND };
    }

    if (updateData.name) {
      const existing = await categoryRepository.findOne({ 
        name: { $regex: `^${updateData.name.trim()}$`, $options: "i" },
        _id: { $ne: id }
      });
      if (existing) {
        throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.CATEGORY.NAME_EXISTS };
      }
    }

    return await categoryRepository.findByIdAndUpdate(id, updateData);
  },

  getCategoryById: async (id) => {
    const category = await categoryRepository.findById(id);
    if (!category) {
      throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.CATEGORY.NOT_FOUND };
    }
    return category;
  },

  toggleStatus: async (id) => {
    const category = await categoryRepository.findById(id);
    if (!category) {
      throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.CATEGORY.NOT_FOUND };
    }
    category.isListed = !category.isListed;
    return await category.save();
  }
};

export default categoryService;
