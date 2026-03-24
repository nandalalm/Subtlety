import Order from "../model/order.js";
import HTTP_STATUS from "../Constants/httpStatus.js";
import MESSAGES from "../Constants/messages.js";

async function postReview(req, res, next) {
  const { productId, orderId, rating, comment } = req.body;
  const user = req.session.user;

  if (!user) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({ success: false, message: MESSAGES.REVIEW.LOGIN_REQUIRED });
  }

  try {
    // Check if the product was delivered in this order
    const order = await Order.findOne({
      _id: orderId,
      userId: user._id,
      "items": {
        $elemMatch: {
          productId: productId,
          status: "Delivered"
        }
      }
    });

    if (!order) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: MESSAGES.REVIEW.NOT_DELIVERED
      });
    }

    // Check if item was returned or has a pending return
    const returnRequest = order.returnRequests.find(
      (req) => req.productId.toString() === productId
    );
    if (returnRequest && returnRequest.status !== "Rejected") {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: returnRequest.status === "Pending"
          ? MESSAGES.REVIEW.RETURN_PENDING
          : MESSAGES.REVIEW.RETURNED
      });
    }

    const review = new Review({
      productId,
      userId: user._id,
      orderId,
      rating: Number(rating),
      comment
    });

    await review.save();

    // Mark the item as rated so the Rate & Review button disappears
    const orderItem = order.items.find(
      (i) => i.productId.toString() === productId
    );
    if (orderItem) {
      orderItem.isRated = true;
      await order.save();
    }

    res.status(HTTP_STATUS.OK).json({ success: true, message: MESSAGES.REVIEW.SUBMITTED });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: MESSAGES.REVIEW.ALREADY_REVIEWED
      });
    }
    next(error);
  }
}

async function loadMoreReviews(req, res, next) {
  const { productId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = 5;
  const skip = (page - 1) * limit;

  try {
    const reviews = await Review.find({ 
      productId, 
      isListed: true,
      comment: { $exists: true, $ne: "" }
    })
      .populate("userId", "firstname lastname")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Review.countDocuments({ 
      productId, 
      isListed: true,
      comment: { $exists: true, $ne: "" }
    });
    const hasMore = total > skip + reviews.length;

    res.status(HTTP_STATUS.OK).json({
      success: true,
      reviews: reviews.map(r => ({
        user: `${r.userId.firstname} ${r.userId.lastname || ""}`,
        rating: r.rating,
        comment: r.comment,
        date: r.createdAt.toLocaleDateString("en-GB")
      })),
      hasMore
    });
  } catch (error) {
    next(error);
  }
}

async function getReviews(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";
    const sort = req.query.sort || "latest";
    const rating = req.query.rating || "";

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

    const countPipeline = [...pipeline, { $count: "total" }];
    const totalCountResult = await Review.aggregate(countPipeline);
    const totalReviews = totalCountResult.length > 0 ? totalCountResult[0].total : 0;
    const totalPages = Math.ceil(totalReviews / limit);

    pipeline.push({ $skip: skip }, { $limit: limit }, {
      $project: {
        _id: 1, rating: 1, comment: 1, isListed: 1, createdAt: 1,
        productId: { _id: "$productDetails._id", name: "$productDetails.name" },
        userId: { _id: "$userDetails._id", firstname: "$userDetails.firstname", email: "$userDetails.email" }
      }
    });

    const reviews = await Review.aggregate(pipeline);
    res.render("admin/reviews", { reviews, currentPage: page, totalPages, limit, search, sort, rating, admin: req.session.admin });
  } catch (error) {
    next(error);
  }
}

async function toggleReviewStatus(req, res, next) {
  try {
    const { id } = req.params;
    const review = await Review.findById(id);
    if (!review) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: MESSAGES.REVIEW.NOT_FOUND });
    review.isListed = !review.isListed;
    await review.save();
    res.status(HTTP_STATUS.OK).json({ success: true, isListed: review.isListed });
  } catch (error) {
    next(error);
  }
}

export {
  postReview,
  loadMoreReviews,
  getReviews,
  toggleReviewStatus
};
