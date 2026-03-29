import Coupon from "../model/coupon.js";

const couponRepository = {
  findOne: async (query) => {
    return await Coupon.findOne(query);
  },

  find: async (query = {}, sort = { createdAt: -1 }, skip = 0, limit = 0) => {
    let q = Coupon.find(query).sort(sort).skip(skip);
    if (limit > 0) q = q.limit(limit);
    return await q;
  },

  countDocuments: async (query = {}) => {
    return await Coupon.countDocuments(query);
  },

  findById: async (id) => {
    return await Coupon.findById(id);
  },

  save: async (couponData) => {
    const coupon = new Coupon(couponData);
    return await coupon.save();
  },

  updateById: async (id, updateData, options = { new: true }) => {
    return await Coupon.findByIdAndUpdate(id, updateData, options);
  },

  updateByQuery: async (query, updateData, options = { new: true }) => {
    return await Coupon.findOneAndUpdate(query, updateData, options);
  }
};

export default couponRepository;
