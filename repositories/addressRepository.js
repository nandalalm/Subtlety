import Address from "../model/userAddress.js";

class AddressRepository {
async find(query = {}, sort = { createdAt: -1 }, skip = 0, limit = 0) {
    let q = Address.find(query).sort(sort).skip(skip);
    if (limit > 0) q = q.limit(limit);
    return await q;
  }

async countDocuments(query = {}) {
    return await Address.countDocuments(query);
  }

async findById(id) {
    return await Address.findById(id);
  }

async save(addressData) {
    const address = new Address(addressData);
    return await address.save();
  }

async findByIdAndUpdate(id, updateData, options = { new: true }) {
    return await Address.findByIdAndUpdate(id, updateData, options);
  }

async findByIdAndDelete(id) {
    return await Address.findByIdAndDelete(id);
  }
}

export default new AddressRepository();
