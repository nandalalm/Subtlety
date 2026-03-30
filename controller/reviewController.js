import reviewService from "../services/reviewService.js";
import HTTP_STATUS from "../Constants/httpStatus.js";
import MESSAGES from "../Constants/messages.js";

async function postReview(req, res, next) {
  try {
    const user = req.session.user;
    if (!user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ success: false, message: MESSAGES.REVIEW.LOGIN_REQUIRED });
    }

    const result = await reviewService.postReview(user._id, req.body);
    res.status(HTTP_STATUS.OK).json({ success: true, message: MESSAGES.REVIEW.SUBMITTED });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.BAD_REQUEST) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
}

async function loadMoreReviews(req, res, next) {
  try {
    const { productId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const data = await reviewService.getLoadMoreReviews(productId, page);
    res.status(HTTP_STATUS.OK).json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
}

async function getReviews(req, res, next) {
  try {
    const data = await reviewService.getAdminReviews(req.query);
    if (req.query.ajax) {
      return res.render("partials/Admin/reviewTable", {
        ...data,
        currentPage: parseInt(req.query.page) || 1,
        search: req.query.search || "",
        sort: req.query.sort || "latest",
        rating: req.query.rating || "",
      });
    }

    res.render("admin/reviews", {
      ...data,
      currentPage: parseInt(req.query.page) || 1,
      search: req.query.search || "",
      sort: req.query.sort || "latest",
      rating: req.query.rating || "",
      admin: req.session.admin
    });
  } catch (error) {
    next(error);
  }
}

async function toggleReviewStatus(req, res, next) {
  try {
    const { id } = req.params;
    const review = await reviewService.toggleReviewStatus(id);
    res.status(HTTP_STATUS.OK).json({ success: true, review });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.NOT_FOUND) return res.status(error.statusCode).json({ success: false, message: error.message });
    next(error);
  }
}

async function getReviewView(req, res, next) {
  try {
    const review = await reviewService.getAdminReviewDetail(req.params.id);
    const backQuery = `page=${req.query.page || 1}&search=${encodeURIComponent(req.query.search || "")}&sort=${req.query.sort || "latest"}&rating=${req.query.rating || ""}`;
    res.render("admin/reviewView", { review, backQuery });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.NOT_FOUND) {
      return res.status(error.statusCode).render("404", { message: error.message });
    }
    next(error);
  }
}

export {
  postReview,
  loadMoreReviews,
  getReviews,
  toggleReviewStatus,
  getReviewView
};
