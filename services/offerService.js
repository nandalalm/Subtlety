import offerRepository from "../repositories/offerRepository.js";
import couponRepository from "../repositories/couponRepository.js";
import productRepository from "../repositories/productRepository.js";
import categoryRepository from "../repositories/categoryRepository.js";
import MESSAGES from "../Constants/messages.js";
import HTTP_STATUS from "../Constants/httpStatus.js";

const OFFER_FOR = {
  PRODUCT: "Product",
  CATEGORY: "Category",
};

const OFFER_TYPES = {
  FLAT: "flat",
  PERCENTAGE: "percentage",
};

const TARGET_SEARCH_LIMIT = 12;

function parsePositiveNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : null;
}

function ensureFutureOrToday(dateValue) {
  const date = new Date(dateValue);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return !Number.isNaN(date.getTime()) && date >= today;
}

function normalizeCouponCode(code) {
  return String(code || "").trim().toUpperCase();
}

function normalizeCouponPayload(couponData) {
  return {
    ...couponData,
    discountAmount: Math.floor(Number(couponData.discountAmount) || 0),
    maxDiscount: Math.floor(Number(couponData.maxDiscount) || 0),
    minOrderValue: Math.floor(Number(couponData.minOrderValue) || 0),
    usageLimit: Math.floor(Number(couponData.usageLimit) || 0),
  };
}

function validateCouponCodeOrThrow(code) {
  const normalizedCode = normalizeCouponCode(code);
  if (normalizedCode.length > 20) {
    throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: "Coupon code cannot exceed 20 characters." };
  }
  if (!/^[A-Z0-9]{4,}$/.test(normalizedCode)) {
    throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.COUPON.INVALID_CODE };
  }
  return normalizedCode;
}

function validateCouponPayloadOrThrow(couponData) {
  const discountType = String(couponData.discountType || "").trim();
  const discountAmount = parsePositiveNumber(couponData.discountAmount);
  const maxDiscount = parsePositiveNumber(couponData.maxDiscount);
  const minOrderValue = parsePositiveNumber(couponData.minOrderValue);
  const usageLimit = parsePositiveNumber(couponData.usageLimit);

  if (!discountType || discountAmount === null || !couponData.expiresAt || usageLimit === null) {
    throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.COUPON.REQUIRED_FIELDS };
  }

  if (!["flat", "percentage"].includes(discountType)) {
    throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: "Please select a valid discount type." };
  }

  if (!ensureFutureOrToday(couponData.expiresAt)) {
    throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.COUPON.INVALID_EXPIRY };
  }

  if (usageLimit < 1) {
    throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: "Usage limit must be at least 1." };
  }

  if (discountType === "percentage") {
    if (discountAmount < 1 || discountAmount > 80) {
      throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.COUPON.INVALID_DISCOUNT };
    }

    if (maxDiscount === null) {
      throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: "Maximum discount is required for percentage coupons." };
    }

    if (maxDiscount < 50 || maxDiscount > 500) {
      throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: "Maximum discount must be between Rs. 50 and Rs. 500." };
    }
  }

  if (discountType === "flat") {
    if (discountAmount <= 0) {
      throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: "Discount amount must be greater than 0." };
    }

    if (minOrderValue === null || minOrderValue <= 0) {
      throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: "Minimum order value must be greater than 0." };
    }

    if (discountAmount >= minOrderValue) {
      throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.COUPON.INVALID_FLAT_DISCOUNT };
    }
  }
}

async function validateOfferPayload(offerData, excludeOfferId = null) {
  const { offerFor, targetId, offerType, expiresAt } = offerData;
  const value = parsePositiveNumber(offerData.value);
  const minProductPrice = parsePositiveNumber(offerData.minProductPrice);

  if (!offerFor || !targetId || !offerType || value === null || !expiresAt) {
    throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.OFFER.REQUIRED_FIELDS };
  }

  if (!ensureFutureOrToday(expiresAt)) {
    throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.OFFER.INVALID_EXPIRY };
  }

  if (value <= 0) {
    throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.OFFER.INVALID_VALUE };
  }

  if (offerType === OFFER_TYPES.PERCENTAGE && (value < 1 || value > 80)) {
    throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.OFFER.INVALID_PERCENTAGE };
  }

  if (offerFor === OFFER_FOR.PRODUCT) {
    const product = await productRepository.findById(targetId);
    if (!product) {
      throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.OFFER.PRODUCT_NOT_FOUND };
    }

    if (offerType === OFFER_TYPES.FLAT && value >= Number(product.price)) {
      throw {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        message: MESSAGES.OFFER.PRODUCT_FLAT_TOO_HIGH(product.name, product.price),
      };
    }
  }

  if (offerFor === OFFER_FOR.CATEGORY) {
    const [category, categoryProducts] = await Promise.all([
      categoryRepository.findById(targetId),
      productRepository.find({ category: targetId }),
    ]);

    if (!category) {
      throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.OFFER.CATEGORY_NOT_FOUND };
    }

    if (!categoryProducts.length) {
      throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.OFFER.CATEGORY_HAS_NO_PRODUCTS };
    }

    const highestPricedProduct = categoryProducts.reduce((highest, product) => (
      Number(product.price) > Number(highest.price) ? product : highest
    ));

    if (offerType === OFFER_TYPES.FLAT) {
      if (minProductPrice === null || minProductPrice <= 0) {
        throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.OFFER.INVALID_MIN_PRODUCT_PRICE };
      }

      if (minProductPrice >= Number(highestPricedProduct.price)) {
        throw {
          statusCode: HTTP_STATUS.BAD_REQUEST,
          message: MESSAGES.OFFER.CATEGORY_MIN_PRICE_TOO_HIGH(
            category.name,
            highestPricedProduct.name,
            highestPricedProduct.price
          ),
        };
      }

      if (value >= minProductPrice) {
        throw {
          statusCode: HTTP_STATUS.BAD_REQUEST,
          message: MESSAGES.OFFER.CATEGORY_FLAT_TOO_HIGH(minProductPrice),
        };
      }
    }
  }

  const existing = await offerRepository.findOne({
    targetId,
    offerFor,
    ...(excludeOfferId ? { _id: { $ne: excludeOfferId } } : {}),
  });

  if (existing) {
    throw {
      statusCode: HTTP_STATUS.BAD_REQUEST,
      message: MESSAGES.OFFER.ALREADY_EXISTS_FOR_TARGET(offerFor),
    };
  }

  return {
    offerFor,
    targetId,
    offerType,
    value,
    minProductPrice: offerFor === OFFER_FOR.CATEGORY && offerType === OFFER_TYPES.FLAT ? minProductPrice : undefined,
    expiresAt,
  };
}

class OfferService {
async searchOfferTargets({ offerFor, search = "" }) {
    const trimmedSearch = search.trim();
    const query = trimmedSearch ? { name: { $regex: trimmedSearch, $options: "i" } } : {};

    if (offerFor === OFFER_FOR.PRODUCT) {
      const products = await productRepository.find(query, { name: 1 }, 0, TARGET_SEARCH_LIMIT);
      return products.map((product) => ({
        value: String(product._id),
        label: product.name,
      }));
    }

    if (offerFor === OFFER_FOR.CATEGORY) {
      const categories = await categoryRepository.find(query, { name: 1 }, 0, TARGET_SEARCH_LIMIT);
      return categories.map((category) => ({
        value: String(category._id),
        label: category.name,
      }));
    }

    throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.OFFER.INVALID_TARGET_TYPE };
  }

async getAdminOffers(queryParams) {
    const { page = 1, limit = 6, search = "", sort = "latest" } = queryParams;
    const skip = (page - 1) * limit;

    let query = {};
    if (search) {
      // 1. Find matching Products and Categories by name
      const [matchingProducts, matchingCategories] = await Promise.all([
        productRepository.find({ name: { $regex: search, $options: "i" } }),
        categoryRepository.find({ name: { $regex: search, $options: "i" } })
      ]);

      const matchingIds = [
        ...matchingProducts.map(p => p._id),
        ...matchingCategories.map(c => c._id)
      ];

      // 2. Build the $or query
      query.$or = [
        { offerFor: { $regex: search, $options: "i" } },
        { offerType: { $regex: search, $options: "i" } },
        { targetId: { $in: matchingIds } }
      ];
    }
    
    if (sort === "active") query.isActive = true;
    else if (sort === "inactive") query.isActive = false;
    else if (sort === "flat" || sort === "percentage") query.offerType = sort;
    else if (sort === "Product" || sort === "Category") query.offerFor = sort;
    else if (sort === "expired") query.expiresAt = { $lt: new Date() };

    let sortOrder = { createdAt: -1 };
    if (sort === "oldest") sortOrder = { createdAt: 1 };

    const [offers, totalOffers, products, categories] = await Promise.all([
      offerRepository.find(query, sortOrder, skip, limit),
      offerRepository.countDocuments(query),
      productRepository.find(),
      categoryRepository.find()
    ]);

    return {
      offers,
      products,
      categories,
      totalPages: Math.ceil(totalOffers / limit),
      totalOffers,
      limit
    };
  }

async addOffer(offerData) {
    const validatedData = await validateOfferPayload(offerData);
    return await offerRepository.save(validatedData);
  }

async updateOffer(id, updateData) {
    const offer = await offerRepository.findById(id);
    if (!offer) {
      throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.OFFER.NOT_FOUND };
    }
    const validatedData = await validateOfferPayload(
      {
        offerFor: updateData.offerFor || offer.offerFor,
        targetId: updateData.targetId || offer.targetId,
        offerType: updateData.offerType,
        value: updateData.value,
        minProductPrice: updateData.minProductPrice,
        expiresAt: updateData.expiresAt,
      },
      id
    );
    return await offerRepository.updateById(id, validatedData);
  }

async toggleOfferStatus(id) {
    const offer = await offerRepository.findById(id);
    if (!offer) {
      throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.OFFER.NOT_FOUND };
    }
    offer.isActive = !offer.isActive;
    return await offer.save();
  }

async getAdminOfferDetail(id) {
    const offer = await offerRepository.findByIdAndPopulate(id, "targetId");
    if (!offer) {
      throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.OFFER.NOT_FOUND };
    }
    return offer;
  }

async getAdminCoupons(queryParams) {
    const { page = 1, limit = 6, search = "", sort = "latest" } = queryParams;
    const skip = (page - 1) * limit;

    let query = {};
    if (search) {
      query.code = { $regex: search.trim(), $options: "i" };
    }

    const now = new Date();

    if (sort === "listed") query.isActive = true;
    else if (sort === "unlisted") query.isActive = false;
    else if (sort === "active") {
      query.isActive = true;
      query.expiresAt = { $gte: now };
    }
    else if (sort === "expired") query.expiresAt = { $lt: now };
    else if (sort === "flat" || sort === "percentage") query.discountType = sort;

    let sortOrder = { _id: -1 };
    if (sort === "oldest") sortOrder = { _id: 1 };

    const coupons = await couponRepository.find(query, sortOrder, skip, limit);
    const totalCoupons = await couponRepository.countDocuments(query);

    return {
      coupons,
      totalPages: Math.ceil(totalCoupons / limit),
      totalCoupons,
      limit
    };
  }

async addCoupon(couponData) {
    const normalizedCode = validateCouponCodeOrThrow(couponData.code);
    validateCouponPayloadOrThrow(couponData);
    const normalizedCouponData = normalizeCouponPayload(couponData);
    const existing = await couponRepository.findOne({ code: normalizedCode });
    if (existing) {
      throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.COUPON.ALREADY_EXISTS };
    }
    return await couponRepository.save({ ...normalizedCouponData, code: normalizedCode });
  }

async updateCoupon(id, updateData) {
    const coupon = await couponRepository.findById(id);
    if (!coupon) {
      throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.COUPON.NOT_FOUND };
    }
    validateCouponPayloadOrThrow(updateData);
    const normalizedCouponData = normalizeCouponPayload(updateData);
    return await couponRepository.updateById(id, { ...normalizedCouponData, code: coupon.code });
  }

async toggleCouponStatus(id) {
    const coupon = await couponRepository.findById(id);
    if (!coupon) {
      throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.COUPON.NOT_FOUND };
    }
    coupon.isActive = !coupon.isActive;
    return await coupon.save();
  }

async getAdminCouponDetail(id) {
    const coupon = await couponRepository.findById(id);
    if (!coupon) {
      throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.COUPON.NOT_FOUND };
    }
    return coupon;
  }
}

export default new OfferService();
