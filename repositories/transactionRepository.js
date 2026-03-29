import Transaction from "../model/transaction.js";

const transactionRepository = {
  find: async (query = {}, sort = { date: -1 }, skip = 0, limit = 0) => {
    let q = Transaction.find(query).sort(sort).skip(skip);
    if (limit > 0) q = q.limit(limit);
    return await q;
  },

  countDocuments: async (query = {}) => {
    return await Transaction.countDocuments(query);
  },

  save: async (transactionData) => {
    const transaction = new Transaction(transactionData);
    return await transaction.save();
  }
};

export default transactionRepository;
