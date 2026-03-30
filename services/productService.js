import productRepository from "../repositories/productRepository.js";
import categoryRepository from "../repositories/categoryRepository.js";
import offerRepository from "../repositories/offerRepository.js";
import MESSAGES from "../Constants/messages.js";

const productService = {
  getAdminProducts: async (queryParams) => {
    const { page = 1, limit = 4, search = "", sort = "latest" } = queryParams;
    const skip = (page - 1) * limit;

    let query = {};
    if (search) {
      const categories = await categoryRepository.find({ name: { $regex: search, $options: "i" } });
      const categoryIds = categories.map(c => c._id);

      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { category: { $in: categoryIds } }
      ];

      const numSearch = Number(search);
      if (!isNaN(numSearch)) {
        query.$or.push({ price: numSearch }, { stock: numSearch });
      }
    }

    if (sort === "listed") query.isListed = true;
    else if (sort === "unlisted") query.isListed = false;

    let sortOrder = { createdAt: -1 };
    if (sort === "oldest") sortOrder = { createdAt: 1 };

    const products = await productRepository.findWithPopulate(query, "category", sortOrder, skip, limit);
    const totalProducts = await productRepository.countDocuments(query);
    const categories = await categoryRepository.find();

    return {
      products,
      categories,
      totalPages: Math.ceil(totalProducts / limit),
      totalProducts,
      limit
    };
  },

  validatePriceAgainstOffers: async (productId, categoryId, newPrice) => {
    const activeFlatOffers = await offerRepository.find({
      $or: [
        { targetId: productId, offerFor: 'Product' },
        { targetId: categoryId, offerFor: 'Category' }
      ],
      offerType: 'flat',
      isActive: true,
      expiresAt: { $gt: new Date() }
    });

    for (const offer of activeFlatOffers) {
      if (newPrice <= offer.value) {
        throw { statusCode: 400, message: `${MESSAGES.PRODUCT.PRICE_OFFER_CONFLICT} (₹${offer.value})` };
      }
    }
  },

  addProduct: async (productData) => {
    const existing = await productRepository.findOne({ name: { $regex: `^${productData.name.trim()}$`, $options: "i" } });
    if (existing) {
      throw { statusCode: 400, message: MESSAGES.PRODUCT.ALREADY_EXISTS };
    }
    return await productRepository.save(productData);
  },

  updateProduct: async (id, updateData) => {
    const product = await productRepository.findById(id);
    if (!product) {
      throw { statusCode: 404, message: MESSAGES.PRODUCT.NOT_FOUND };
    }

    if (updateData.name) {
      const existing = await productRepository.findOne({ 
        name: { $regex: `^${updateData.name.trim()}$`, $options: "i" },
        _id: { $ne: id }
      });
      if (existing) {
        throw { statusCode: 400, message: MESSAGES.PRODUCT.ALREADY_EXISTS };
      }
    }

    if (updateData.price && updateData.price !== product.price) {
      await productService.validatePriceAgainstOffers(id, updateData.category || product.category, updateData.price);
    }

    return await productRepository.updateById(id, updateData);
  },

  toggleStatus: async (id) => {
    const product = await productRepository.findById(id);
    if (!product) {
      throw { statusCode: 404, message: MESSAGES.PRODUCT.NOT_FOUND };
    }
    product.isListed = !product.isListed;
    return await product.save();
  },

  getAdminProductDetail: async (id) => {
    const product = await productRepository.findByIdAndPopulate(id, "category");
    if (!product) {
      throw { statusCode: 404, message: MESSAGES.PRODUCT.NOT_FOUND };
    }
    return product;
  }
};

export default productService;
