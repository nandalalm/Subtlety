import Wallet from "../model/wallet.js";

class WalletRepository {
async findOne(query) {
    return await Wallet.findOne(query);
  }

async save(walletData) {
    const wallet = new Wallet(walletData);
    return await wallet.save();
  }

async updateByQuery(query, updateData, options = { new: true }) {
    return await Wallet.findOneAndUpdate(query, updateData, options);
  }
}

export default new WalletRepository();
