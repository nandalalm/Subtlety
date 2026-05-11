import User from "../model/user.js";

class UserRepository {
async findById(id) {
    return await User.findById(id);
  }

async findOne(query) {
    return await User.findOne(query);
  }

async updateById(id, updateData) {
    return await User.findByIdAndUpdate(id, updateData, { new: true });
  }

async updateOne(query, updateData) {
    return await User.updateOne(query, updateData);
  }

async save(userData) {
    const user = new User(userData);
    return await user.save();
  }

async find(query = {}, sort = { createdAt: -1 }, skip = 0, limit = 0) {
    let q = User.find(query).sort(sort).skip(skip);
    if (limit > 0) q = q.limit(limit);
    return await q;
  }

async countDocuments(query = {}) {
    return await User.countDocuments(query);
  }

async findByIdWithPopulate(id, populateField) {
    return await User.findById(id).populate(populateField);
  }
}

export default new UserRepository();
