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

async function getAddOfferPage(req, res, next) {
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

async function getEditOfferPage(req, res, next) {
  try {
    const offer = await offerService.getAdminOfferDetail(req.params.id);
    res.render("admin/offerForm", {
      offer,
      mode: "edit",
      backQuery: `page=${req.query.page || 1}&search=${encodeURIComponent(req.query.search || "")}&sort=${req.query.sort || "latest"}`
    });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.NOT_FOUND) return res.status(HTTP_STATUS.NOT_FOUND).render("404", { message: error.message });
    next(error);
  }
}

async function searchOfferTargets(req, res, next) {
  try {
    const targets = await offerService.searchOfferTargets({
      offerFor: req.query.offerFor,
      search: req.query.search || "",
    });
    res.status(HTTP_STATUS.OK).json({ success: true, targets });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.BAD_REQUEST) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
}

async function addOffer(req, res, next) {
  const { offerFor, targetId, offerType, value, minProductPrice, expiresAt } = req.body;

  if (!offerFor || !targetId || !offerType || value === undefined || !expiresAt) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.OFFER.REQUIRED_FIELDS });
  }

  try {
    await offerService.addOffer({
      offerFor, targetId, offerType, value,
      minProductPrice: offerFor === "Category" && offerType === "flat" ? minProductPrice : undefined,
      expiresAt,
    });
    res.status(HTTP_STATUS.CREATED).json({ success: true, message: MESSAGES.OFFER.ADDED });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.BAD_REQUEST || error.statusCode === HTTP_STATUS.NOT_FOUND) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
}

async function editOffer(req, res, next) {
  const offerId = req.params.id;
  const { targetId, offerFor, offerType, value, minProductPrice, expiresAt } = req.body;
  try {
    const updated = await offerService.updateOffer(offerId, { 
      targetId, offerFor, offerType, value, minProductPrice, expiresAt 
    });
    res.status(HTTP_STATUS.OK).json({ success: true, message: MESSAGES.OFFER.UPDATED, offer: updated });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.BAD_REQUEST || error.statusCode === HTTP_STATUS.NOT_FOUND) {
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
    if (error.statusCode === HTTP_STATUS.NOT_FOUND) return res.status(HTTP_STATUS.NOT_FOUND).send(error.message);
    next(error);
  }
}

async function getOfferView(req, res, next) {
  try {
    const offer = await offerService.getAdminOfferDetail(req.params.id);
    const backQuery = `page=${req.query.page || 1}&search=${encodeURIComponent(req.query.search || "")}&sort=${req.query.sort || "latest"}`;
    res.render("admin/offerView", { offer, backQuery });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.NOT_FOUND) return res.status(HTTP_STATUS.NOT_FOUND).render("404", { message: error.message });
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

async function getAddCouponPage(req, res, next) {
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

async function getEditCouponPage(req, res, next) {
  try {
    const coupon = await offerService.getAdminCouponDetail(req.params.id);
    res.render("admin/couponForm", {
      coupon,
      mode: "edit",
      backQuery: `page=${req.query.page || 1}&search=${encodeURIComponent(req.query.search || "")}&sort=${req.query.sort || "latest"}`
    });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.NOT_FOUND) return res.status(HTTP_STATUS.NOT_FOUND).render("404", { message: error.message });
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
    if (error.statusCode === HTTP_STATUS.BAD_REQUEST) {
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
    if (error.statusCode === HTTP_STATUS.BAD_REQUEST || error.statusCode === HTTP_STATUS.NOT_FOUND) {
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
    if (error.statusCode === HTTP_STATUS.NOT_FOUND) return res.status(HTTP_STATUS.NOT_FOUND).send(error.message);
    next(error);
  }
}

async function getCouponView(req, res, next) {
  try {
    const coupon = await offerService.getAdminCouponDetail(req.params.id);
    const backQuery = `page=${req.query.page || 1}&search=${encodeURIComponent(req.query.search || "")}&sort=${req.query.sort || "latest"}`;
    res.render("admin/couponView", { coupon, backQuery });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.NOT_FOUND) return res.status(HTTP_STATUS.NOT_FOUND).render("404", { message: error.message });
    next(error);
  }
}

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
  toggleCouponStatus,
};
