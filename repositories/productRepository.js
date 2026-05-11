import Product from "../model/product.js";

class ProductRepository {
async findById(id) {
    return await Product.findById(id);
  }

async findByIdAndPopulate(id, populatePath) {
    return await Product.findById(id).populate(populatePath);
  }

async findOne(query) {
    return await Product.findOne(query);
  }

async find(query = {}, sort = { createdAt: -1 }, skip = 0, limit = 0) {
    let q = Product.find(query).sort(sort).skip(skip);
    if (limit > 0) q = q.limit(limit);
    return await q;
  }

async findWithPopulate(query = {}, populatePath = "", sort = { createdAt: -1 }, skip = 0, limit = 0) {
    let q = Product.find(query).populate(populatePath).sort(sort).skip(skip);
    if (limit > 0) q = q.limit(limit);
    return await q;
  }

async countDocuments(query = {}) {
    return await Product.countDocuments(query);
  }

async save(productData) {
    const product = new Product(productData);
    return await product.save();
  }

async updateById(id, updateData, options = { new: true, runValidators: true }) {
    return await Product.findByIdAndUpdate(id, updateData, options);
  }

async updateByQuery(query, updateData, options = { new: true }) {
    return await Product.findOneAndUpdate(query, updateData, options);
  }

async findByIdAndDelete(id) {
    return await Product.findByIdAndDelete(id);
  }
}

export default new ProductRepository();
