import Product from "../model/product.js";

const productRepository = {
  findById: async (id) => {
    return await Product.findById(id);
  },

  findByIdAndPopulate: async (id, populatePath) => {
    return await Product.findById(id).populate(populatePath);
  },

  findOne: async (query) => {
    return await Product.findOne(query);
  },

  find: async (query = {}, sort = { createdAt: -1 }, skip = 0, limit = 0) => {
    let q = Product.find(query).sort(sort).skip(skip);
    if (limit > 0) q = q.limit(limit);
    return await q;
  },

  findWithPopulate: async (query = {}, populatePath = "", sort = { createdAt: -1 }, skip = 0, limit = 0) => {
    let q = Product.find(query).populate(populatePath).sort(sort).skip(skip);
    if (limit > 0) q = q.limit(limit);
    return await q;
  },

  countDocuments: async (query = {}) => {
    return await Product.countDocuments(query);
  },

  save: async (productData) => {
    const product = new Product(productData);
    return await product.save();
  },

  updateById: async (id, updateData, options = { new: true, runValidators: true }) => {
    return await Product.findByIdAndUpdate(id, updateData, options);
  },

  updateByQuery: async (query, updateData, options = { new: true }) => {
    return await Product.findOneAndUpdate(query, updateData, options);
  },

  findByIdAndDelete: async (id) => {
    return await Product.findByIdAndDelete(id);
  }
};

export default productRepository;
