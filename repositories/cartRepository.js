import Cart from "../model/cart.js";

class CartRepository {
async findOne(query) {
    return await Cart.findOne(query);
  }

async findOneWithPopulate(query, populatePath) {
    return await Cart.findOne(query).populate(populatePath);
  }

async save(cartData) {
    const cart = new Cart(cartData);
    return await cart.save();
  }

async updateByQuery(query, updateData, options = { new: true }) {
    return await Cart.findOneAndUpdate(query, updateData, options);
  }

async deleteOne(query) {
    return await Cart.deleteOne(query);
  }
}

export default new CartRepository();
