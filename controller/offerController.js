import Category from "../model/category.js";
import HTTP_STATUS from "../Constants/httpStatus.js";
import MESSAGES from "../Constants/messages.js";

async function getOffers(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 6;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";
    const sortParam = req.query.sort || "latest";

    let query = {};
    if (search) {
      const matchingProducts = await Product.find({ name: { $regex: search, $options: "i" } }).select('_id');
      const matchingCategories = await Category.find({ name: { $regex: search, $options: "i" } }).select('_id');
      const targetIds = [...matchingProducts.map(p => p._id), ...matchingCategories.map(c => c._id)];
      query.targetId = { $in: targetIds };
    }

    let sortOrder = { createdAt: -1 };
    if (sortParam === "oldest") sortOrder = { createdAt: 1 };
    
    if (sortParam === "active") {
      query.isActive = true;
      query.expiresAt = { $gt: new Date() };
      sortOrder = { expiresAt: 1 };
    }
    if (sortParam === "expired") {
      query.expiresAt = { $lt: new Date() };
      sortOrder = { expiresAt: -1 };
    }
    
    if (sortParam === "flat") query.offerType = "flat";
    if (sortParam === "percentage") query.offerType = "percentage";
    if (sortParam === "Product" || sortParam === "Category") query.offerFor = sortParam;

    const offers = await Offer.find(query)
      .sort(sortOrder)
      .skip(skip)
      .limit(limit);

    const totalOffers = await Offer.countDocuments(query);
    const totalPages = Math.ceil(totalOffers / limit);

    const products = await Product.find();
    const categories = await Category.find();

    res.render("admin/offer", {
      offers,
      products,
      categories,
      currentPage: page,
      totalPages,
      search,
      sort: sortParam,
      limit,
      admin: req.session.admin
    });
  } catch (error) {
    next(error);
  }
}

async function addOffer(req, res, next) {
  const {
    offerFor,
    targetId,
    offerType,
    value,
    maxDiscount,
    minProductPrice,
    expiresAt,
    usedCount = 0,
  } = req.body;

  if (!offerFor || !targetId || !offerType || value === undefined || !expiresAt) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: MESSAGES.OFFER.REQUIRED_FIELDS });
  }

  const currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);
  const expiryDate = new Date(expiresAt);
  if (expiryDate < currentDate) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.OFFER.INVALID_EXPIRY });
  }

  try {
    const existingOffer = await Offer.findOne({ targetId, offerType, value, expiresAt: new Date(expiresAt) });
    if (existingOffer) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.OFFER.ALREADY_EXISTS });
    }

    if (offerFor === "Product" && offerType === "flat") {
      const product = await Product.findById(targetId);
      if (!product) return res.status(HTTP_STATUS.NOT_FOUND).json({ message: MESSAGES.OFFER.NOT_FOUND });
      if (value >= product.price) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.OFFER.PRICE_EXCEEDED });
      }
    }

    const newOffer = new Offer({
      offerFor, targetId, offerType, value,
      maxDiscount: offerFor === "Category" ? maxDiscount : undefined,
      minProductPrice: offerFor === "Category" && offerType === "flat" ? minProductPrice : undefined,
      expiresAt, usedCount,
    });

    await newOffer.save();
    res.status(HTTP_STATUS.CREATED).json({ message: MESSAGES.OFFER.ADDED });
  } catch (error) {
    next(error);
  }
}

async function editOffer(req, res, next) {
  try {
    const offerId = req.params.id;
    const { targetId, offerFor, offerType, value, minProductPrice, maxDiscount, expiresAt } = req.body;

    const currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);
    const expiryDate = new Date(expiresAt);
    if (expiryDate < currentDate) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.OFFER.INVALID_EXPIRY });
    }

    const duplicateOffer = await Offer.findOne({ _id: { $ne: offerId }, targetId, offerType, value, expiresAt: new Date(expiresAt) });
    if (duplicateOffer) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.OFFER.ALREADY_EXISTS });
    }

    if (offerFor === "Product" && offerType === "flat") {
      const product = await Product.findById(targetId);
      if (value >= product.price) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.OFFER.PRICE_EXCEEDED });
      }
    }

    const updatedOffer = await Offer.findByIdAndUpdate(offerId, { targetId, offerFor, offerType, value, minProductPrice, maxDiscount, expiresAt }, { new: true });
    res.status(HTTP_STATUS.OK).json({ message: MESSAGES.OFFER.UPDATED, offer: updatedOffer });
  } catch (error) {
    next(error);
  }
}

async function toggleOfferStatus(req, res, next) {
  const offerId = req.params.id;
  try {
    const offer = await Offer.findById(offerId);
    if (!offer) return res.status(HTTP_STATUS.NOT_FOUND).send(MESSAGES.OFFER.NOT_FOUND);
    offer.isActive = !offer.isActive;
    await offer.save();
    res.status(HTTP_STATUS.OK).send(MESSAGES.OFFER.STATUS_UPDATED);
  } catch (error) {
    next(error);
  }
}

async function getCoupons(req, res, next) {
  const limit = 6;
  const currentPage = parseInt(req.query.page) || 1;
  const skip = (currentPage - 1) * limit;
  const search = req.query.search || "";
  const sort = req.query.sort || "latest";

  try {
    let query = {};
    const currentDate = new Date();
    if (search) query.code = { $regex: search, $options: "i" };

    let sortQuery = { createdAt: -1 };
    if (sort === "oldest") sortQuery = { createdAt: 1 };
    else if (sort === "listed") query.isActive = true;
    else if (sort === "unlisted") query.isActive = false;
    else if (sort === "active") { query.isActive = true; query.expiresAt = { $gt: currentDate }; }
    else if (sort === "expired") query.expiresAt = { $lt: currentDate };
    else if (sort === "flat") query.discountType = "flat";
    else if (sort === "percentage") query.discountType = "percentage";

    const coupons = await Coupon.find(query).sort(sortQuery).skip(skip).limit(limit);
    const totalCoupons = await Coupon.countDocuments(query);
    const totalPages = Math.ceil(totalCoupons / limit);

    res.render("admin/coupons", { coupons, currentPage, totalPages, limit, search, sort, admin: req.session.admin });
  } catch (error) {
    next(error);
  }
}

async function addCoupon(req, res, next) {
  const { code, discountAmount, discountType, maxDiscount, minOrderValue, expiresAt, usageLimit } = req.body;
  if (!code || !discountAmount || !expiresAt || !usageLimit) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.COUPON.REQUIRED_FIELDS });

  const expirationDate = new Date(expiresAt);
  if (expirationDate <= new Date()) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.COUPON.INVALID_EXPIRY });

  if (discountType === "percentage" && (discountAmount <= 0 || discountAmount > 80)) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.COUPON.INVALID_DISCOUNT });
  if (discountType === "flat" && Number(discountAmount) >= Number(minOrderValue)) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.COUPON.INVALID_FLAT_DISCOUNT });

  try {
    const existingCoupon = await Coupon.findOne({ code });
    if (existingCoupon) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.COUPON.ALREADY_EXISTS });

    const newCoupon = new Coupon({ code, discountAmount, discountType, maxDiscount: discountType === "flat" ? 0 : maxDiscount, minOrderValue: discountType === "percentage" ? 0 : minOrderValue, expiresAt, usageLimit });
    await newCoupon.save();
    res.status(HTTP_STATUS.CREATED).json({ success: true, message: MESSAGES.COUPON.ADDED });
  } catch (error) {
    next(error);
  }
}

async function editCoupon(req, res, next) {
  const { id } = req.params;
  const { code, discountAmount, discountType, maxDiscount, minOrderValue, expiresAt, usageLimit } = req.body;

  try {
    const updatedCoupon = await Coupon.findById(id);
    if (!updatedCoupon) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: MESSAGES.COUPON.NOT_FOUND });

    const expirationDate = expiresAt ? new Date(expiresAt) : null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (expiresAt && expirationDate <= today) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.COUPON.INVALID_EXPIRY });

    if (code && code !== updatedCoupon.code) {
      const existingCoupon = await Coupon.findOne({ code });
      if (existingCoupon) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.COUPON.ALREADY_EXISTS });
    }

    if (discountType === "percentage" && (discountAmount <= 0 || discountAmount > 80)) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.COUPON.INVALID_DISCOUNT });
    if (discountType === "flat" && Number(discountAmount) >= Number(minOrderValue)) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.COUPON.INVALID_FLAT_DISCOUNT });

    updatedCoupon.code = code || updatedCoupon.code;
    updatedCoupon.discountAmount = discountAmount || updatedCoupon.discountAmount;
    updatedCoupon.discountType = discountType || updatedCoupon.discountType;
    updatedCoupon.expiresAt = expiresAt || updatedCoupon.expiresAt;
    updatedCoupon.usageLimit = usageLimit || updatedCoupon.usageLimit;
    if (discountType === "flat") { updatedCoupon.maxDiscount = 0; updatedCoupon.minOrderValue = minOrderValue; }
    else if (discountType === "percentage") { updatedCoupon.minOrderValue = 0; updatedCoupon.maxDiscount = maxDiscount; }

    await updatedCoupon.save();
    res.status(HTTP_STATUS.OK).json({ success: true, message: MESSAGES.COUPON.UPDATED, coupon: updatedCoupon });
  } catch (error) {
    next(error);
  }
}

async function toggleCouponStatus(req, res, next) {
  const { id } = req.params;
  try {
    const coupon = await Coupon.findById(id);
    if (!coupon) return res.status(HTTP_STATUS.NOT_FOUND).send(MESSAGES.COUPON.NOT_FOUND);
    coupon.isActive = !coupon.isActive;
    await coupon.save();
    res.status(HTTP_STATUS.OK).json({ message: MESSAGES.COUPON.STATUS_UPDATED });
  } catch (error) {
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
