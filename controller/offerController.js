import offerService from "../services/offerService.js";
import HTTP_STATUS from "../Constants/httpStatus.js";
import MESSAGES from "../Constants/messages.js";

class OfferController {
async getOffers(req, res, next) {
  try {
    const queryParams = {
      page: parseInt(req.query.page) || 1,
      limit: 6,
      search: req.query.search || "",
      sort: req.query.sort || "latest"
    };

    const data = await offerService.getAdminOffers(queryParams);

    if (req.query.ajax) {
      return res.render("partials/Admin/offerTable", {
        ...data,
        currentPage: queryParams.page,
        search: queryParams.search,
        sort: queryParams.sort,
        limit: queryParams.limit
      });
    }

    res.render("admin/offer", {
      ...data,
      currentPage: queryParams.page,
      search: queryParams.search,
      sort: queryParams.sort,
      limit: queryParams.limit,
      admin: req.session.admin
    });
  } catch (error) {
    next(error);
  }
}

async getAddOfferPage(req, res, next) {
  try {
    res.render("admin/offerForm", {
      offer: null,
      mode: "add",
      backQuery: `page=${req.query.page || 1}&search=${encodeURIComponent(req.query.search || "")}&sort=${req.query.sort || "latest"}`
    });
  } catch (error) {
    next(error);
  }
}

async getEditOfferPage(req, res, next) {
  try {
    const offer = await offerService.getAdminOfferDetail(req.params.id);
    res.render("admin/offerForm", {
      offer,
      mode: "edit",
      backQuery: `page=${req.query.page || 1}&search=${encodeURIComponent(req.query.search || "")}&sort=${req.query.sort || "latest"}`
    });
  } catch (error) {
    next(error);
  }
}

async searchOfferTargets(req, res, next) {
  try {
    const targets = await offerService.searchOfferTargets({
      offerFor: req.query.offerFor,
      search: req.query.search || "",
    });
    res.status(HTTP_STATUS.OK).json({ success: true, targets });
  } catch (error) {
    next(error);
  }
}

async addOffer(req, res, next) {
  const { offerFor, targetId, offerType, value, minProductPrice, expiresAt } = req.body;

  if (!offerFor || !targetId || !offerType || value === undefined || !expiresAt) {
    return next({ statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.OFFER.REQUIRED_FIELDS });
  }

  try {
    await offerService.addOffer({
      offerFor, targetId, offerType, value,
      minProductPrice: offerFor === "Category" && offerType === "flat" ? minProductPrice : undefined,
      expiresAt,
    });
    res.status(HTTP_STATUS.CREATED).json({ success: true, message: MESSAGES.OFFER.ADDED });
  } catch (error) {
    next(error);
  }
}

async editOffer(req, res, next) {
  const offerId = req.params.id;
  const { targetId, offerFor, offerType, value, minProductPrice, expiresAt } = req.body;
  try {
    const updated = await offerService.updateOffer(offerId, { 
      targetId, offerFor, offerType, value, minProductPrice, expiresAt 
    });
    res.status(HTTP_STATUS.OK).json({ success: true, message: MESSAGES.OFFER.UPDATED, offer: updated });
  } catch (error) {
    next(error);
  }
}

async toggleOfferStatus(req, res, next) {
  const offerId = req.params.id;
  try {
    const updatedOffer = await offerService.toggleOfferStatus(offerId);
    res.status(HTTP_STATUS.OK).json({ 
      success: true, 
      message: MESSAGES.OFFER.STATUS_UPDATED,
      offer: updatedOffer
    });
  } catch (error) {
    next(error);
  }
}

async getOfferView(req, res, next) {
  try {
    const offer = await offerService.getAdminOfferDetail(req.params.id);
    const backQuery = `page=${req.query.page || 1}&search=${encodeURIComponent(req.query.search || "")}&sort=${req.query.sort || "latest"}`;
    res.render("admin/offerView", { offer, backQuery });
  } catch (error) {
    next(error);
  }
}

async getCoupons(req, res, next) {
  const queryParams = {
    page: parseInt(req.query.page) || 1,
    limit: 6,
    search: req.query.search || "",
    sort: req.query.sort || "latest"
  };
  try {
    const data = await offerService.getAdminCoupons(queryParams);
    if (req.query.ajax) {
      return res.render("partials/Admin/couponTable", {
        ...data,
        currentPage: queryParams.page,
        limit: queryParams.limit,
        search: queryParams.search,
        sort: queryParams.sort
      });
    }

    res.render("admin/coupons", { 
      ...data, 
      currentPage: queryParams.page, 
      limit: queryParams.limit, 
      search: queryParams.search, 
      sort: queryParams.sort, 
      admin: req.session.admin 
    });
  } catch (error) {
    next(error);
  }
}

async getAddCouponPage(req, res, next) {
  try {
    res.render("admin/couponForm", {
      coupon: null,
      mode: "add",
      backQuery: `page=${req.query.page || 1}&search=${encodeURIComponent(req.query.search || "")}&sort=${req.query.sort || "latest"}`
    });
  } catch (error) {
    next(error);
  }
}

async getEditCouponPage(req, res, next) {
  try {
    const coupon = await offerService.getAdminCouponDetail(req.params.id);
    res.render("admin/couponForm", {
      coupon,
      mode: "edit",
      backQuery: `page=${req.query.page || 1}&search=${encodeURIComponent(req.query.search || "")}&sort=${req.query.sort || "latest"}`
    });
  } catch (error) {
    next(error);
  }
}

async addCoupon(req, res, next) {
  const { code, discountAmount, discountType, maxDiscount, minOrderValue, expiresAt, usageLimit } = req.body;
  if (!code || !discountAmount || !expiresAt || !usageLimit) {
    return next({ statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.COUPON.REQUIRED_FIELDS });
  }

  try {
    await offerService.addCoupon({ 
      code, discountAmount, discountType, 
      maxDiscount: discountType === "flat" ? 0 : maxDiscount, 
      minOrderValue: discountType === "percentage" ? 0 : minOrderValue, 
      expiresAt, usageLimit 
    });
    res.status(HTTP_STATUS.CREATED).json({ success: true, message: MESSAGES.COUPON.ADDED });
  } catch (error) {
    next(error);
  }
}

async editCoupon(req, res, next) {
  const { id } = req.params;
  const { code, discountAmount, discountType, maxDiscount, minOrderValue, expiresAt, usageLimit } = req.body;
  try {
    const updated = await offerService.updateCoupon(id, { 
      code, discountAmount, discountType, maxDiscount, minOrderValue, expiresAt, usageLimit 
    });
    res.status(HTTP_STATUS.OK).json({ success: true, message: MESSAGES.COUPON.UPDATED, coupon: updated });
  } catch (error) {
    next(error);
  }
}

async toggleCouponStatus(req, res, next) {
  const { id } = req.params;
  try {
    const updatedCoupon = await offerService.toggleCouponStatus(id);
    res.status(HTTP_STATUS.OK).json({ 
      success: true, 
      message: MESSAGES.COUPON.STATUS_UPDATED,
      coupon: updatedCoupon
    });
  } catch (error) {
    next(error);
  }
}

async getCouponView(req, res, next) {
  try {
    const coupon = await offerService.getAdminCouponDetail(req.params.id);
    const backQuery = `page=${req.query.page || 1}&search=${encodeURIComponent(req.query.search || "")}&sort=${req.query.sort || "latest"}`;
    res.render("admin/couponView", { coupon, backQuery });
  } catch (error) {
    next(error);
  }
}
}

const offerController = new OfferController();

const getOffers = offerController.getOffers.bind(offerController);
const getAddOfferPage = offerController.getAddOfferPage.bind(offerController);
const getEditOfferPage = offerController.getEditOfferPage.bind(offerController);
const searchOfferTargets = offerController.searchOfferTargets.bind(offerController);
const addOffer = offerController.addOffer.bind(offerController);
const editOffer = offerController.editOffer.bind(offerController);
const getOfferView = offerController.getOfferView.bind(offerController);
const toggleOfferStatus = offerController.toggleOfferStatus.bind(offerController);
const getCoupons = offerController.getCoupons.bind(offerController);
const getAddCouponPage = offerController.getAddCouponPage.bind(offerController);
const getEditCouponPage = offerController.getEditCouponPage.bind(offerController);
const addCoupon = offerController.addCoupon.bind(offerController);
const editCoupon = offerController.editCoupon.bind(offerController);
const getCouponView = offerController.getCouponView.bind(offerController);
const toggleCouponStatus = offerController.toggleCouponStatus.bind(offerController);

export {
  getOffers,
  getAddOfferPage,
  getEditOfferPage,
  searchOfferTargets,
  addOffer,
  editOffer,
  getOfferView,
  toggleOfferStatus,
  getCoupons,
  getAddCouponPage,
  getEditCouponPage,
  addCoupon,
  editCoupon,
  getCouponView,
  toggleCouponStatus
};
