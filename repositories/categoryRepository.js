import Category from "../model/category.js";

class CategoryRepository {
async find(query = {}, sort = { createdAt: -1 }, skip = 0, limit = 0) {
    let q = Category.find(query).sort(sort).skip(skip);
    if (limit > 0) q = q.limit(limit);
    return await q;
  }

async countDocuments(query = {}) {
    return await Category.countDocuments(query);
  }

async findOne(query) {
    return await Category.findOne(query);
  }

async findById(id) {
    return await Category.findById(id);
  }

async save(categoryData) {
    const category = new Category(categoryData);
    return await category.save();
  }

async findByIdAndUpdate(id, updateData, options = { new: true }) {
    return await Category.findByIdAndUpdate(id, updateData, options);
  }
}

export default new CategoryRepository();
