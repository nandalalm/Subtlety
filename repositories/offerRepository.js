import Offer from "../model/offer.js";

const offerRepository = {
  findOne: async (query) => {
    return await Offer.findOne(query);
  },

  find: async (query = {}, sort = { createdAt: -1 }, skip = 0, limit = 0) => {
    let q = Offer.find(query).sort(sort).skip(skip);
    if (limit > 0) q = q.limit(limit);
    return await q;
  },

  countDocuments: async (query = {}) => {
    return await Offer.countDocuments(query);
  },

  findById: async (id) => {
    return await Offer.findById(id);
  },

  save: async (offerData) => {
    const offer = new Offer(offerData);
    return await offer.save();
  },

  updateById: async (id, updateData, options = { new: true }) => {
    return await Offer.findByIdAndUpdate(id, updateData, options);
  },

  updateByQuery: async (query, updateData, options = { new: true }) => {
    return await Offer.findOneAndUpdate(query, updateData, options);
  }
};

export default offerRepository;
