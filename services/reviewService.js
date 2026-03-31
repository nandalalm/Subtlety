import reviewRepository from "../repositories/reviewRepository.js";
import orderRepository from "../repositories/orderRepository.js";
import HTTP_STATUS from "../Constants/httpStatus.js";
import MESSAGES from "../Constants/messages.js";

const reviewService = {
  postReview: async (userId, reviewData) => {
    const { productId, orderId, rating, comment } = reviewData;
    const normalizedComment = typeof comment === "string" ? comment.trim() : "";

    if (!rating || Number(rating) < 1 || Number(rating) > 5) {
      const error = new Error(MESSAGES.REVIEW.RATING_REQUIRED);
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      throw error;
    }

    if (typeof comment === "string" && comment.length > 0 && normalizedComment.length === 0) {
      const error = new Error(MESSAGES.REVIEW.INVALID_COMMENT);
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      throw error;
    }

    // Check if the product was delivered in this order
    const order = await orderRepository.findOne({
      _id: orderId,
      userId: userId,
      "items": {
        $elemMatch: {
          productId: productId,
          status: "Delivered"
        }
      }
    });

    if (!order) {
      const error = new Error(MESSAGES.REVIEW.NOT_DELIVERED);
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      throw error;
    }

    // Check if item was returned or has a pending return
    const returnRequest = (order.returnRequests || []).find(
      (r) => r.productId.toString() === productId
    );
    if (returnRequest && returnRequest.status !== "Rejected") {
      const error = new Error(
        returnRequest.status === "Pending"
          ? MESSAGES.REVIEW.RETURN_PENDING
          : MESSAGES.REVIEW.RETURNED
      );
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      throw error;
    }

    const review = {
      productId,
      userId: userId,
      orderId,
      rating: Number(rating),
      comment: normalizedComment || undefined
    };

    try {
      await reviewRepository.save(review);
    } catch (err) {
      if (err.code === 11000) {
        const error = new Error(MESSAGES.REVIEW.ALREADY_REVIEWED);
        error.statusCode = HTTP_STATUS.BAD_REQUEST;
        throw error;
      }
      throw err;
    }

    // Mark the item as rated so the Rate & Review button disappears
    const orderItem = order.items.find(
      (i) => i.productId.toString() === productId
    );
    if (orderItem) {
      orderItem.isRated = true;
      await orderRepository.save(order);
    }

    return { success: true };
  },

  getLoadMoreReviews: async (productId, page = 1) => {
    const limit = 5;
    const skip = (page - 1) * limit;

    const query = {
      productId,
      isListed: true,
      comment: { $exists: true, $ne: "" }
    };

    const reviews = await reviewRepository.findWithPopulate(
      query,
      "userId",
      { createdAt: -1 },
      skip,
      limit
    );

    const total = await reviewRepository.countDocuments(query);
    const hasMore = total > skip + reviews.length;

    const formattedReviews = reviews.map(r => ({
      user: `${r.userId.firstname} ${r.userId.lastname || ""}`,
      rating: r.rating,
      comment: r.comment,
      date: new Date(r.createdAt).toLocaleDateString("en-GB")
    }));

    return { reviews: formattedReviews, hasMore };
  },

  getAdminReviews: async (queryParams) => {
    const page = parseInt(queryParams.page) || 1;
    const limit = parseInt(queryParams.limit) || 5;
    const skip = (page - 1) * limit;

    const [reviews, totalReviews] = await Promise.all([
      reviewRepository.getAdminReviews(queryParams, skip, limit),
      reviewRepository.countAdminReviews(queryParams)
    ]);

    const totalPages = Math.ceil(totalReviews / limit);

    return { reviews, totalPages, totalReviews, limit };
  },

  toggleReviewStatus: async (reviewId) => {
    const review = await reviewRepository.findById(reviewId);
    if (!review) {
      const error = new Error(MESSAGES.REVIEW.NOT_FOUND);
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      throw error;
    }
    review.isListed = !review.isListed;
    await reviewRepository.updateById(reviewId, { isListed: review.isListed });
    return { isListed: review.isListed };
  },

  getAdminReviewDetail: async (reviewId) => {
    const review = await reviewRepository.findByIdAndPopulate(reviewId, [
      { path: "productId", select: "name images category price isListed" },
      { path: "userId", select: "firstname lastname email phoneNo" },
      { path: "orderId", select: "orderId orderDate" }
    ]);

    if (!review) {
      const error = new Error(MESSAGES.REVIEW.NOT_FOUND);
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      throw error;
    }

    return review;
  }
};

export default reviewService;
