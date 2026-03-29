import User from "../model/user.js";

const userRepository = {
  findById: async (id) => {
    return await User.findById(id);
  },

  findOne: async (query) => {
    return await User.findOne(query);
  },

  updateById: async (id, updateData) => {
    return await User.findByIdAndUpdate(id, updateData, { new: true });
  },

  updateOne: async (query, updateData) => {
    return await User.updateOne(query, updateData);
  },

  save: async (userData) => {
    const user = new User(userData);
    return await user.save();
  },

  find: async (query = {}, sort = { createdAt: -1 }, skip = 0, limit = 0) => {
    let q = User.find(query).sort(sort).skip(skip);
    if (limit > 0) q = q.limit(limit);
    return await q;
  },

  countDocuments: async (query = {}) => {
    return await User.countDocuments(query);
  },

  findByIdWithPopulate: async (id, populateField) => {
    return await User.findById(id).populate(populateField);
  }
};

export default userRepository;
