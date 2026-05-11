import Coupon from "../model/coupon.js";

class CouponRepository {
async findOne(query) {
    return await Coupon.findOne(query);
  }

async find(query = {}, sort = { createdAt: -1 }, skip = 0, limit = 0) {
    let q = Coupon.find(query).sort(sort).skip(skip);
    if (limit > 0) q = q.limit(limit);
    return await q;
  }

async countDocuments(query = {}) {
    return await Coupon.countDocuments(query);
  }

async findById(id) {
    return await Coupon.findById(id);
  }

async save(couponData) {
    const coupon = new Coupon(couponData);
    return await coupon.save();
  }

async updateById(id, updateData, options = { new: true }) {
    return await Coupon.findByIdAndUpdate(id, updateData, options);
  }

async updateByQuery(query, updateData, options = { new: true }) {
    return await Coupon.findOneAndUpdate(query, updateData, options);
  }
}

export default new CouponRepository();
