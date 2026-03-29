import Wishlist from "../model/wishlist.js";

const wishlistRepository = {
  findOne: async (query) => {
    return await Wishlist.findOne(query);
  },

  findOneAndPopulate: async (query, populatePath) => {
    return await Wishlist.findOne(query).populate(populatePath);
  },

  save: async (wishlistData) => {
    const wishlist = new Wishlist(wishlistData);
    return await wishlist.save();
  },

  updateByQuery: async (query, updateData, options = { new: true }) => {
    return await Wishlist.findOneAndUpdate(query, updateData, options);
  }
};

export default wishlistRepository;
