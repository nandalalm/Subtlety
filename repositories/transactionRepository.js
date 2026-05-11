import Transaction from "../model/transaction.js";

class TransactionRepository {
async find(query = {}, sort = { date: -1 }, skip = 0, limit = 0) {
    let q = Transaction.find(query).sort(sort).skip(skip);
    if (limit > 0) q = q.limit(limit);
    return await q;
  }

async countDocuments(query = {}) {
    return await Transaction.countDocuments(query);
  }

async save(transactionData) {
    const transaction = new Transaction(transactionData);
    return await transaction.save();
  }
}

export default new TransactionRepository();
