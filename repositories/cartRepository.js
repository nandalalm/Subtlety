import Cart from "../model/cart.js";

const cartRepository = {
  findOne: async (query) => {
    return await Cart.findOne(query);
  },

  findOneWithPopulate: async (query, populatePath) => {
    return await Cart.findOne(query).populate(populatePath);
  },

  save: async (cartData) => {
    const cart = new Cart(cartData);
    return await cart.save();
  },

  updateByQuery: async (query, updateData, options = { new: true }) => {
    return await Cart.findOneAndUpdate(query, updateData, options);
  },

  deleteOne: async (query) => {
    return await Cart.deleteOne(query);
  }
};

export default cartRepository;
