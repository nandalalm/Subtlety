import Address from "../model/userAddress.js";

const addressRepository = {
  find: async (query = {}, sort = { createdAt: -1 }, skip = 0, limit = 0) => {
    let q = Address.find(query).sort(sort).skip(skip);
    if (limit > 0) q = q.limit(limit);
    return await q;
  },

  countDocuments: async (query = {}) => {
    return await Address.countDocuments(query);
  },

  findById: async (id) => {
    return await Address.findById(id);
  },

  save: async (addressData) => {
    const address = new Address(addressData);
    return await address.save();
  },

  findByIdAndUpdate: async (id, updateData, options = { new: true }) => {
    return await Address.findByIdAndUpdate(id, updateData, options);
  },

  findByIdAndDelete: async (id) => {
    return await Address.findByIdAndDelete(id);
  }
};

export default addressRepository;
