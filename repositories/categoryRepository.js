import Category from "../model/category.js";

const categoryRepository = {
  find: async (query = {}, sort = { createdAt: -1 }, skip = 0, limit = 0) => {
    let q = Category.find(query).sort(sort).skip(skip);
    if (limit > 0) q = q.limit(limit);
    return await q;
  },

  countDocuments: async (query = {}) => {
    return await Category.countDocuments(query);
  },

  findOne: async (query) => {
    return await Category.findOne(query);
  },

  findById: async (id) => {
    return await Category.findById(id);
  },

  save: async (categoryData) => {
    const category = new Category(categoryData);
    return await category.save();
  },

  findByIdAndUpdate: async (id, updateData, options = { new: true }) => {
    return await Category.findByIdAndUpdate(id, updateData, options);
  }
};

export default categoryRepository;
