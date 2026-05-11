import Wishlist from "../model/wishlist.js";

class WishlistRepository {
async findOne(query) {
    return await Wishlist.findOne(query);
  }

async findOneAndPopulate(query, populatePath) {
    return await Wishlist.findOne(query).populate(populatePath);
  }

async save(wishlistData) {
    const wishlist = new Wishlist(wishlistData);
    return await wishlist.save();
  }

async updateByQuery(query, updateData, options = { new: true }) {
    return await Wishlist.findOneAndUpdate(query, updateData, options);
  }
}

export default new WishlistRepository();
