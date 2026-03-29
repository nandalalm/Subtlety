import offerService from "../services/offerService.js";
import HTTP_STATUS from "../Constants/httpStatus.js";
import MESSAGES from "../Constants/messages.js";

async function getOffers(req, res, next) {
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

async function addOffer(req, res, next) {
  const { offerFor, targetId, offerType, value, maxDiscount, minProductPrice, expiresAt } = req.body;

  if (!offerFor || !targetId || !offerType || value === undefined || !expiresAt) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.OFFER.REQUIRED_FIELDS });
  }

  try {
    await offerService.addOffer({
      offerFor, targetId, offerType, value,
      maxDiscount: offerFor === "Category" ? maxDiscount : undefined,
      minProductPrice: offerFor === "Category" && offerType === "flat" ? minProductPrice : undefined,
      expiresAt,
    });
    res.status(HTTP_STATUS.CREATED).json({ success: true, message: MESSAGES.OFFER.ADDED });
  } catch (error) {
    if (error.statusCode === 400 || error.statusCode === 404) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
}

async function editOffer(req, res, next) {
  const offerId = req.params.id;
  const { targetId, offerFor, offerType, value, minProductPrice, maxDiscount, expiresAt } = req.body;
  try {
    const updated = await offerService.updateOffer(offerId, { 
      targetId, offerFor, offerType, value, minProductPrice, maxDiscount, expiresAt 
    });
    res.status(HTTP_STATUS.OK).json({ success: true, message: MESSAGES.OFFER.UPDATED, offer: updated });
  } catch (error) {
    if (error.statusCode === 400 || error.statusCode === 404) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
}

async function toggleOfferStatus(req, res, next) {
  const offerId = req.params.id;
  try {
    const updatedOffer = await offerService.toggleOfferStatus(offerId);
    res.status(HTTP_STATUS.OK).json({ 
      success: true, 
      message: MESSAGES.OFFER.STATUS_UPDATED,
      offer: updatedOffer
    });
  } catch (error) {
    if (error.statusCode === 404) return res.status(HTTP_STATUS.NOT_FOUND).send(error.message);
    next(error);
  }
}

async function getCoupons(req, res, next) {
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

async function addCoupon(req, res, next) {
  const { code, discountAmount, discountType, maxDiscount, minOrderValue, expiresAt, usageLimit } = req.body;
  if (!code || !discountAmount || !expiresAt || !usageLimit) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.COUPON.REQUIRED_FIELDS });
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
    if (error.statusCode === 400) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: error.message });
    }
    next(error);
  }
}

async function editCoupon(req, res, next) {
  const { id } = req.params;
  const { code, discountAmount, discountType, maxDiscount, minOrderValue, expiresAt, usageLimit } = req.body;
  try {
    const updated = await offerService.updateCoupon(id, { 
      code, discountAmount, discountType, maxDiscount, minOrderValue, expiresAt, usageLimit 
    });
    res.status(HTTP_STATUS.OK).json({ success: true, message: MESSAGES.COUPON.UPDATED, coupon: updated });
  } catch (error) {
    if (error.statusCode === 400 || error.statusCode === 404) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
}

async function toggleCouponStatus(req, res, next) {
  const { id } = req.params;
  try {
    const updatedCoupon = await offerService.toggleCouponStatus(id);
    res.status(HTTP_STATUS.OK).json({ 
      success: true, 
      message: MESSAGES.COUPON.STATUS_UPDATED,
      coupon: updatedCoupon
    });
  } catch (error) {
    if (error.statusCode === 404) return res.status(HTTP_STATUS.NOT_FOUND).send(error.message);
    next(error);
  }
}

export {
  getOffers,
  addOffer,
  editOffer,
  toggleOfferStatus,
  getCoupons,
  addCoupon,
  editCoupon,
  toggleCouponStatus,
};
