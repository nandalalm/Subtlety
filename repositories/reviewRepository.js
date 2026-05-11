import Review from "../model/review.js";

class ReviewRepository {
async find(query = {}, sort = { createdAt: -1 }, skip = 0, limit = 0) {
    let q = Review.find(query).sort(sort).skip(skip);
    if (limit > 0) q = q.limit(limit);
    return await q;
  }

async findWithPopulate(query = {}, populatePath = "", sort = { createdAt: -1 }, skip = 0, limit = 0) {
    let q = Review.find(query).populate(populatePath).sort(sort).skip(skip);
    if (limit > 0) q = q.limit(limit);
    return await q;
  }

async countDocuments(query = {}) {
    return await Review.countDocuments(query);
  }

async aggregate(pipeline) {
    return await Review.aggregate(pipeline);
  }

async save(reviewData) {
    const review = new Review(reviewData);
    return await review.save();
  }

async findById(id) {
    return await Review.findById(id);
  }

async findByIdAndPopulate(id, populatePath) {
    return await Review.findById(id).populate(populatePath);
  }

async updateById(id, updateData, options = { new: true }) {
    return await Review.findByIdAndUpdate(id, updateData, options);
  }

async getTopRatedProducts(limit = 5) {
    return await Review.aggregate([
      { $match: { isListed: true } },
      { $group: { _id: "$productId", avgRating: { $avg: "$rating" }, reviewCount: { $sum: 1 } } },
      { $sort: { avgRating: -1, reviewCount: -1 } },
      { $limit: limit },
      { $lookup: { from: "products", localField: "_id", foreignField: "_id", as: "product" } },
      { $unwind: "$product" },
      { $project: { name: "$product.name", image: { $arrayElemAt: ["$product.images", 0] }, avgRating: 1, reviewCount: 1 } }
    ]);
  }

async getAdminReviews(queryParams, skip, limit) {
    const { search, sort, rating } = queryParams;
    const pipeline = [
      { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "userDetails" } },
      { $unwind: "$userDetails" },
      { $lookup: { from: "products", localField: "productId", foreignField: "_id", as: "productDetails" } },
      { $unwind: "$productDetails" }
    ];

    if (search) {
      pipeline.push({ $match: { $or: [ { "userDetails.firstname": { $regex: search, $options: "i" } }, { "userDetails.email": { $regex: search, $options: "i" } } ] } });
    }

    const matchStage = {};
    if (sort === "listed") matchStage.isListed = true;
    if (sort === "unlisted") matchStage.isListed = false;
    if (Object.keys(matchStage).length > 0) pipeline.push({ $match: matchStage });

    let sortStage = { createdAt: -1 };
    if (sort === "oldest") sortStage = { createdAt: 1 };
    if (rating === "rating-low") sortStage = { rating: 1 };
    if (rating === "rating-high") sortStage = { rating: -1 };
    pipeline.push({ $sort: sortStage });

    pipeline.push({ $skip: skip }, { $limit: limit }, {
      $project: {
        _id: 1, rating: 1, comment: 1, isListed: 1, createdAt: 1,
        productId: { _id: "$productDetails._id", name: "$productDetails.name" },
        userId: { _id: "$userDetails._id", firstname: "$userDetails.firstname", email: "$userDetails.email" }
      }
    });

    return await Review.aggregate(pipeline);
  }

async countAdminReviews(queryParams) {
    const { search, sort } = queryParams;
    const pipeline = [
      { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "userDetails" } },
      { $unwind: "$userDetails" }
    ];

    if (search) {
      pipeline.push({ $match: { $or: [ { "userDetails.firstname": { $regex: search, $options: "i" } }, { "userDetails.email": { $regex: search, $options: "i" } } ] } });
    }

    const matchStage = {};
    if (sort === "listed") matchStage.isListed = true;
    if (sort === "unlisted") matchStage.isListed = false;
    if (Object.keys(matchStage).length > 0) pipeline.push({ $match: matchStage });

    pipeline.push({ $count: "total" });
    const result = await Review.aggregate(pipeline);
    return result.length > 0 ? result[0].total : 0;
  }
}

export default new ReviewRepository();
