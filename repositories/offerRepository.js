import Offer from "../model/offer.js";

class OfferRepository {
async findOne(query) {
    return await Offer.findOne(query);
  }

async find(query = {}, sort = { createdAt: -1 }, skip = 0, limit = 0) {
    let q = Offer.find(query).sort(sort).skip(skip);
    if (limit > 0) q = q.limit(limit);
    return await q;
  }

async countDocuments(query = {}) {
    return await Offer.countDocuments(query);
  }

async findById(id) {
    return await Offer.findById(id);
  }

async findByIdAndPopulate(id, populatePath) {
    return await Offer.findById(id).populate(populatePath);
  }

async save(offerData) {
    const offer = new Offer(offerData);
    return await offer.save();
  }

async updateById(id, updateData, options = { new: true }) {
    return await Offer.findByIdAndUpdate(id, updateData, options);
  }

async updateByQuery(query, updateData, options = { new: true }) {
    return await Offer.findOneAndUpdate(query, updateData, options);
  }
}

export default new OfferRepository();
