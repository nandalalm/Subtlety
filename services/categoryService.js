import categoryRepository from "../repositories/categoryRepository.js";
import MESSAGES from "../Constants/messages.js";
import HTTP_STATUS from "../Constants/httpStatus.js";

function normalizeCategoryNameOrThrow(name) {
  const normalizedName = String(name || "").trim();

  if (!normalizedName) {
    throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: "Category name is required." };
  }

  if (normalizedName.length > 50) {
    throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: "Category name cannot exceed 50 characters." };
  }

  return normalizedName;
}

const ongoingCategoryRequests = new Set();

class CategoryService {
async getCategories(queryParams) {
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
  }

async addCategory(categoryData) {
    const normalizedName = normalizeCategoryNameOrThrow(categoryData.name);
    const requestKey = `${normalizedName}_${categoryData.isListed}`;
    if (ongoingCategoryRequests.has(requestKey)) {
      throw { statusCode: HTTP_STATUS.CONFLICT, message: MESSAGES.CATEGORY.DUPLICATE_REQUEST };
    }

    ongoingCategoryRequests.add(requestKey);
    try {
      const existing = await categoryRepository.findOne({ name: { $regex: `^${normalizedName}$`, $options: "i" } });
      if (existing) {
        throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.CATEGORY.ALREADY_EXISTS };
      }
      return await categoryRepository.save({ ...categoryData, name: normalizedName });
    } finally {
      ongoingCategoryRequests.delete(requestKey);
    }
  }

async updateCategory(id, updateData) {
    const category = await categoryRepository.findById(id);
    if (!category) {
      throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.CATEGORY.NOT_FOUND };
    }

    if (updateData.name) {
      const normalizedName = normalizeCategoryNameOrThrow(updateData.name);
      const existing = await categoryRepository.findOne({ 
        name: { $regex: `^${normalizedName}$`, $options: "i" },
        _id: { $ne: id }
      });
      if (existing) {
        throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.CATEGORY.NAME_EXISTS };
      }

      updateData.name = normalizedName;
    }

    return await categoryRepository.findByIdAndUpdate(id, updateData);
  }

async getCategoryById(id) {
    const category = await categoryRepository.findById(id);
    if (!category) {
      throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.CATEGORY.NOT_FOUND };
    }
    return category;
  }

async toggleStatus(id) {
    const category = await categoryRepository.findById(id);
    if (!category) {
      throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.CATEGORY.NOT_FOUND };
    }
    category.isListed = !category.isListed;
    return await category.save();
  }
}

export default new CategoryService();
