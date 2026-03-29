import Wallet from "../model/wallet.js";

const walletRepository = {
  findOne: async (query) => {
    return await Wallet.findOne(query);
  },

  save: async (walletData) => {
    const wallet = new Wallet(walletData);
    return await wallet.save();
  },

  updateByQuery: async (query, updateData, options = { new: true }) => {
    return await Wallet.findOneAndUpdate(query, updateData, options);
  }
};

export default walletRepository;
