import offerRepository from "../repositories/offerRepository.js";
import couponRepository from "../repositories/couponRepository.js";
import productRepository from "../repositories/productRepository.js";
import categoryRepository from "../repositories/categoryRepository.js";
import MESSAGES from "../Constants/messages.js";

const offerService = {
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
    const existing = await offerRepository.findOne({ 
      targetId: offerData.targetId, 
      offerFor: offerData.offerFor 
    });
    if (existing) {
      throw { statusCode: 400, message: "An offer already exists for this " + offerData.offerFor.toLowerCase() };
    }
    return await offerRepository.save(offerData);
  },

  updateOffer: async (id, updateData) => {
    const offer = await offerRepository.findById(id);
    if (!offer) {
      throw { statusCode: 404, message: MESSAGES.OFFER.NOT_FOUND };
    }
    return await offerRepository.updateById(id, updateData);
  },

  toggleOfferStatus: async (id) => {
    const offer = await offerRepository.findById(id);
    if (!offer) {
      throw { statusCode: 404, message: MESSAGES.OFFER.NOT_FOUND };
    }
    offer.isActive = !offer.isActive;
    return await offer.save();
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
    const existing = await couponRepository.findOne({ code: couponData.code.trim().toUpperCase() });
    if (existing) {
      throw { statusCode: 400, message: MESSAGES.COUPON.ALREADY_EXISTS };
    }
    return await couponRepository.save({ ...couponData, code: couponData.code.trim().toUpperCase() });
  },

  updateCoupon: async (id, updateData) => {
    const coupon = await couponRepository.findById(id);
    if (!coupon) {
      throw { statusCode: 404, message: MESSAGES.COUPON.NOT_FOUND };
    }
    return await couponRepository.updateById(id, updateData);
  },

  toggleCouponStatus: async (id) => {
    const coupon = await couponRepository.findById(id);
    if (!coupon) {
      throw { statusCode: 404, message: MESSAGES.COUPON.NOT_FOUND };
    }
    coupon.isActive = !coupon.isActive;
    return await coupon.save();
  }
};

export default offerService;
