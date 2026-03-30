import offerRepository from "../repositories/offerRepository.js";
import couponRepository from "../repositories/couponRepository.js";
import productRepository from "../repositories/productRepository.js";
import categoryRepository from "../repositories/categoryRepository.js";
import MESSAGES from "../Constants/messages.js";

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
  return Number.isFinite(parsed) ? parsed : null;
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

function validateCouponCodeOrThrow(code) {
  const normalizedCode = normalizeCouponCode(code);
  if (!/^[A-Z0-9]{4,}$/.test(normalizedCode)) {
    throw { statusCode: 400, message: MESSAGES.COUPON.INVALID_CODE };
  }
  return normalizedCode;
}

async function validateOfferPayload(offerData, excludeOfferId = null) {
  const { offerFor, targetId, offerType, expiresAt } = offerData;
  const value = parsePositiveNumber(offerData.value);
  const minProductPrice = parsePositiveNumber(offerData.minProductPrice);

  if (!offerFor || !targetId || !offerType || value === null || !expiresAt) {
    throw { statusCode: 400, message: MESSAGES.OFFER.REQUIRED_FIELDS };
  }

  if (!ensureFutureOrToday(expiresAt)) {
    throw { statusCode: 400, message: MESSAGES.OFFER.INVALID_EXPIRY };
  }

  if (value <= 0) {
    throw { statusCode: 400, message: MESSAGES.OFFER.INVALID_VALUE };
  }

  if (offerType === OFFER_TYPES.PERCENTAGE && (value < 1 || value > 80)) {
    throw { statusCode: 400, message: MESSAGES.OFFER.INVALID_PERCENTAGE };
  }

  if (offerFor === OFFER_FOR.PRODUCT) {
    const product = await productRepository.findById(targetId);
    if (!product) {
      throw { statusCode: 404, message: MESSAGES.OFFER.PRODUCT_NOT_FOUND };
    }

    if (offerType === OFFER_TYPES.FLAT && value >= Number(product.price)) {
      throw {
        statusCode: 400,
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
      throw { statusCode: 404, message: MESSAGES.OFFER.CATEGORY_NOT_FOUND };
    }

    if (!categoryProducts.length) {
      throw { statusCode: 400, message: MESSAGES.OFFER.CATEGORY_HAS_NO_PRODUCTS };
    }

    const highestPricedProduct = categoryProducts.reduce((highest, product) => (
      Number(product.price) > Number(highest.price) ? product : highest
    ));

    if (offerType === OFFER_TYPES.FLAT) {
      if (minProductPrice === null || minProductPrice <= 0) {
        throw { statusCode: 400, message: "Minimum product price must be greater than 0." };
      }

      if (minProductPrice >= Number(highestPricedProduct.price)) {
        throw {
          statusCode: 400,
          message: MESSAGES.OFFER.CATEGORY_MIN_PRICE_TOO_HIGH(
            category.name,
            highestPricedProduct.name,
            highestPricedProduct.price
          ),
        };
      }

      if (value >= minProductPrice) {
        throw {
          statusCode: 400,
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
      statusCode: 400,
      message: "An offer already exists for this " + offerFor.toLowerCase(),
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

const offerService = {
  searchOfferTargets: async ({ offerFor, search = "" }) => {
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

    throw { statusCode: 400, message: "Invalid offer target type." };
  },

  getAdminOffers: async (queryParams) => {
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
  },

  addOffer: async (offerData) => {
    const validatedData = await validateOfferPayload(offerData);
    return await offerRepository.save(validatedData);
  },

  updateOffer: async (id, updateData) => {
    const offer = await offerRepository.findById(id);
    if (!offer) {
      throw { statusCode: 404, message: MESSAGES.OFFER.NOT_FOUND };
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
  },

  toggleOfferStatus: async (id) => {
    const offer = await offerRepository.findById(id);
    if (!offer) {
      throw { statusCode: 404, message: MESSAGES.OFFER.NOT_FOUND };
    }
    offer.isActive = !offer.isActive;
    return await offer.save();
  },

  getAdminOfferDetail: async (id) => {
    const offer = await offerRepository.findByIdAndPopulate(id, "targetId");
    if (!offer) {
      throw { statusCode: 404, message: MESSAGES.OFFER.NOT_FOUND };
    }
    return offer;
  },

  getAdminCoupons: async (queryParams) => {
    const { page = 1, limit = 6, search = "", sort = "latest" } = queryParams;
    const skip = (page - 1) * limit;

    let query = {};
    if (search) {
      query.code = { $regex: search.trim(), $options: "i" };
    }

    const now = new Date();

    // Status/type filters — applied to MongoDB query
    if (sort === "listed") query.isActive = true;
    else if (sort === "unlisted") query.isActive = false;
    else if (sort === "active") {
      // Active = listed AND not expired
      query.isActive = true;
      query.expiresAt = { $gte: now };
    }
    else if (sort === "expired") query.expiresAt = { $lt: now };
    else if (sort === "flat" || sort === "percentage") query.discountType = sort;

    // Sort order — use _id since coupon schema has no timestamps
    let sortOrder = { _id: -1 }; // latest first by default
    if (sort === "oldest") sortOrder = { _id: 1 };

    const coupons = await couponRepository.find(query, sortOrder, skip, limit);
    const totalCoupons = await couponRepository.countDocuments(query);

    return {
      coupons,
      totalPages: Math.ceil(totalCoupons / limit),
      totalCoupons,
      limit
    };
  },

  addCoupon: async (couponData) => {
    const normalizedCode = validateCouponCodeOrThrow(couponData.code);
    const existing = await couponRepository.findOne({ code: normalizedCode });
    if (existing) {
      throw { statusCode: 400, message: MESSAGES.COUPON.ALREADY_EXISTS };
    }
    return await couponRepository.save({ ...couponData, code: normalizedCode });
  },

  updateCoupon: async (id, updateData) => {
    const coupon = await couponRepository.findById(id);
    if (!coupon) {
      throw { statusCode: 404, message: MESSAGES.COUPON.NOT_FOUND };
    }
    const normalizedCode = validateCouponCodeOrThrow(updateData.code);
    const existing = await couponRepository.findOne({ code: normalizedCode, _id: { $ne: id } });
    if (existing) {
      throw { statusCode: 400, message: MESSAGES.COUPON.ALREADY_EXISTS };
    }
    return await couponRepository.updateById(id, { ...updateData, code: normalizedCode });
  },

  toggleCouponStatus: async (id) => {
    const coupon = await couponRepository.findById(id);
    if (!coupon) {
      throw { statusCode: 404, message: MESSAGES.COUPON.NOT_FOUND };
    }
    coupon.isActive = !coupon.isActive;
    return await coupon.save();
  },

  getAdminCouponDetail: async (id) => {
    const coupon = await couponRepository.findById(id);
    if (!coupon) {
      throw { statusCode: 404, message: MESSAGES.COUPON.NOT_FOUND };
    }
    return coupon;
  }
};

export default offerService;
