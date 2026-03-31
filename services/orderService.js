import orderRepository from "../repositories/orderRepository.js";
import cartRepository from "../repositories/cartRepository.js";
import productRepository from "../repositories/productRepository.js";
import userRepository from "../repositories/userRepository.js";
import addressRepository from "../repositories/addressRepository.js";
import couponRepository from "../repositories/couponRepository.js";
import walletRepository from "../repositories/walletRepository.js";
import transactionRepository from "../repositories/transactionRepository.js";
import Razorpay from "razorpay";
import {
  roundToTwo,
  generateOrderId,
  generateTransactionId,
  getBestOffer,
  getBestOfferBatch
} from "../utils/helper.js";
import MESSAGES from "../Constants/messages.js";
import HTTP_STATUS from "../Constants/httpStatus.js";

const razorpayInstance = new Razorpay({
  key_id: "rzp_test_KZK1gW6B1A7B5s",
  key_secret: "ttwYmmlesedbxjWK8AF59uJq",
});

async function calculateTotalsInternal(cartItems) {
    let originalSubtotal = 0;
    let offerDiscount = 0;
    const productsWithPrices = await Promise.all(
        cartItems.map(async (item) => {
            const product = item.productId;
            const bestOffer = await getBestOffer(product);
            const originalPrice = product.price;
            const discountedPrice = bestOffer ? bestOffer.discountedPrice : originalPrice;
            
            originalSubtotal += originalPrice * item.quantity;
            offerDiscount += (originalPrice - discountedPrice) * item.quantity;
            
            return {
            productId: product._id.toString(),
                itemPrice: originalPrice,
                discountedPrice: discountedPrice,
                totalItemPrice: discountedPrice * item.quantity,
                bestOffer
            };
        })
    );
    originalSubtotal = Math.floor(originalSubtotal);
    offerDiscount = Math.floor(offerDiscount);
    const netTotal = originalSubtotal - offerDiscount;
    const deliveryFee = (netTotal > 0 && netTotal < 600) ? 80 : 0;
    return { 
      subtotal: originalSubtotal, 
      offerDiscount: Math.max(0, offerDiscount), 
      deliveryFee, 
      total: netTotal + deliveryFee, 
      productsWithPrices 
    };
}

async function getCheckoutValidationState(userId) {
  const cart = await cartRepository.findOneWithPopulate({ user: userId }, {
    path: "products.productId",
    populate: { path: "category", model: "Category", select: "name isListed" }
  });

  if (!cart || cart.products.length === 0) {
    throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.ORDER.CART_EMPTY, redirect: "/cart" };
  }

  const populatedProducts = cart.products
    .map((item) => item.productId)
    .filter(Boolean);
  const bestOffers = await getBestOfferBatch(populatedProducts);

  let originalSubtotal = 0;
  let offerDiscount = 0;
  let hasPriceChanges = false;
  let cartSnapshotChanged = false;
  const errors = [];

  const productsWithPrices = cart.products.map((item) => {
    const product = item.productId;
    if (!product) {
      errors.push({
        productId: String(item.productId || ""),
        status: "unavailable",
        message: MESSAGES.ORDER.PRODUCT_UNAVAILABLE_CART("Unknown product")
      });
      return null;
    }

    const offerIndex = populatedProducts.findIndex((p) => String(p._id) === String(product._id));
    const bestOffer = offerIndex >= 0 ? bestOffers[offerIndex] : null;
    const originalPrice = product.price;
    const currentDiscountedPrice = bestOffer ? bestOffer.discountedPrice : originalPrice;
    const storedDiscountedPrice = item.discountedPrice;
    const category = product.category;

    const productObject = product.toObject ? product.toObject() : product;
    const enrichedProduct = {
      ...productObject,
      bestOffer,
      currentDiscountedPrice
    };

    if (!product.isListed) {
      errors.push({
        productId: String(product._id),
        status: "unavailable",
        productName: product.name,
        message: MESSAGES.ORDER.PRODUCT_UNAVAILABLE_CART(product.name)
      });
      return { ...item.toObject(), productId: enrichedProduct, discountedPrice: currentDiscountedPrice };
    }

    if (!category || category.isListed === false) {
      errors.push({
        productId: String(product._id),
        status: "category-unlisted",
        productName: product.name,
        categoryName: category?.name || "This category",
        message: MESSAGES.ORDER.CATEGORY_UNAVAILABLE_CART(product.name, category?.name || "This category")
      });
      return { ...item.toObject(), productId: enrichedProduct, discountedPrice: currentDiscountedPrice };
    }

    if (product.stock <= 0) {
      errors.push({
        productId: String(product._id),
        status: "out-of-stock",
        productName: product.name,
        message: MESSAGES.ORDER.PRODUCT_INSUFFICIENT_STOCK(product.name, 0),
        availableStock: 0
      });
      return { ...item.toObject(), productId: enrichedProduct, discountedPrice: currentDiscountedPrice };
    }

    if (item.quantity > product.stock) {
      errors.push({
        productId: String(product._id),
        status: "low-stock",
        productName: product.name,
        message: MESSAGES.ORDER.PRODUCT_INSUFFICIENT_STOCK(product.name, product.stock),
        availableStock: product.stock
      });
    }

    if (storedDiscountedPrice === undefined || storedDiscountedPrice === null) {
      item.discountedPrice = currentDiscountedPrice;
      cartSnapshotChanged = true;
    } else if (Math.abs(currentDiscountedPrice - storedDiscountedPrice) > 0.01) {
      hasPriceChanges = true;
      cartSnapshotChanged = true;
      item.discountedPrice = currentDiscountedPrice;
      errors.push({
        productId: String(product._id),
        status: "price-changed",
        productName: product.name,
        previousPrice: Math.floor(storedDiscountedPrice),
        currentPrice: Math.floor(currentDiscountedPrice),
        message: MESSAGES.ORDER.PRODUCT_PRICE_CHANGED(product.name, currentDiscountedPrice)
      });
    }

    const effectiveQuantity = Math.min(item.quantity, product.stock);
    originalSubtotal += originalPrice * effectiveQuantity;
    offerDiscount += (originalPrice - currentDiscountedPrice) * effectiveQuantity;

    return {
      ...item.toObject(),
      productId: enrichedProduct,
      discountedPrice: currentDiscountedPrice
    };
  });

  if (cartSnapshotChanged) {
    await cart.save();
  }

  originalSubtotal = Math.floor(originalSubtotal);
  offerDiscount = Math.floor(offerDiscount);
  const netTotal = originalSubtotal - offerDiscount;
  const deliveryCharge = (netTotal > 0 && netTotal < 600) ? 80 : 0;

  const blockingStatuses = new Set(["unavailable", "category-unlisted", "out-of-stock", "low-stock", "price-changed"]);
  const blockingErrors = errors.filter((error) => blockingStatuses.has(error.status));

  let message = "";
  if (blockingErrors.some((error) => error.status === "price-changed")) {
    message = MESSAGES.ORDER.PRICE_CHANGED;
  } else if (blockingErrors.length > 0) {
    message = blockingErrors.map((error) => error.message).join(" ");
  }

  return {
    cart,
    productsWithPrices: productsWithPrices.filter(Boolean),
    subtotal: originalSubtotal,
    offerDiscount: Math.max(0, offerDiscount),
    deliveryCharge,
    totalAmount: Math.floor(netTotal + deliveryCharge),
    errors: blockingErrors,
    hasBlockingIssues: blockingErrors.length > 0,
    hasPriceChanges,
    message
  };
}

function buildCouponTotals(pricingSnapshot, couponDiscount) {
  const normalizedDiscount = Math.max(0, Math.floor(couponDiscount || 0));
  return {
    subtotal: Math.floor(pricingSnapshot.subtotal || 0),
    offerDiscount: Math.floor(pricingSnapshot.offerDiscount || 0),
    deliveryCharge: Math.floor(pricingSnapshot.deliveryCharge || 0),
    couponDiscount: normalizedDiscount,
    totalAmount: Math.floor((pricingSnapshot.baseTotal || 0) - normalizedDiscount)
  };
}

function buildCouponState({ code, status, message, pricingSnapshot, coupon, discount = 0, previousDiscount = null }) {
  const normalizedDiscount = Math.max(0, Math.floor(discount || 0));
  return {
    code,
    status,
    message,
    isApplied: normalizedDiscount > 0 && status !== "inactive" && status !== "expired" && status !== "already-used" && status !== "usage-limit" && status !== "min-order",
    discount: normalizedDiscount,
    previousDiscount: previousDiscount === null ? null : Math.max(0, Math.floor(previousDiscount || 0)),
    discountType: coupon?.discountType || null,
    discountAmount: coupon ? Math.floor(coupon.discountAmount || 0) : 0,
    maxDiscount: coupon ? Math.floor(coupon.maxDiscount || 0) : 0,
    minOrderValue: coupon ? Math.floor(coupon.minOrderValue || 0) : 0,
    totals: buildCouponTotals(pricingSnapshot, normalizedDiscount)
  };
}

async function getCouponValidationState(userId, couponCode, pricingSnapshot, previousDiscount = null) {
  const normalizedCode = String(couponCode || "").trim();
  const baseTotal = Math.floor(pricingSnapshot.baseTotal || 0);

  const [coupon, user] = await Promise.all([
    couponRepository.findOne({ code: normalizedCode }),
    userRepository.findById(userId)
  ]);

  if (!coupon || !coupon.isActive) {
    return buildCouponState({
      code: normalizedCode,
      status: "inactive",
      message: MESSAGES.COUPON.NO_LONGER_AVAILABLE(normalizedCode),
      pricingSnapshot,
      previousDiscount
    });
  }

  if (new Date() > coupon.expiresAt) {
    return buildCouponState({
      code: normalizedCode,
      status: "expired",
      message: MESSAGES.COUPON.EXPIRED,
      pricingSnapshot,
      coupon,
      previousDiscount
    });
  }

  if (user.usedCoupons.includes(normalizedCode)) {
    return buildCouponState({
      code: normalizedCode,
      status: "already-used",
      message: MESSAGES.COUPON.ALREADY_USED,
      pricingSnapshot,
      coupon,
      previousDiscount
    });
  }

  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
    return buildCouponState({
      code: normalizedCode,
      status: "usage-limit",
      message: MESSAGES.COUPON.USAGE_LIMIT_REACHED,
      pricingSnapshot,
      coupon,
      previousDiscount
    });
  }

  if (coupon.minOrderValue && baseTotal < coupon.minOrderValue) {
    return buildCouponState({
      code: normalizedCode,
      status: "min-order",
      message: MESSAGES.COUPON.MIN_ORDER_TOTAL_BELOW(baseTotal, coupon.minOrderValue, normalizedCode),
      pricingSnapshot,
      coupon,
      previousDiscount
    });
  }

  let discount = coupon.discountType === "flat" ? coupon.discountAmount : (coupon.discountAmount / 100) * baseTotal;
  discount = Math.floor(discount);
  if (coupon.maxDiscount && discount > coupon.maxDiscount) discount = Math.floor(coupon.maxDiscount);

  if (previousDiscount !== null && Math.floor(previousDiscount) !== discount) {
    return buildCouponState({
      code: normalizedCode,
      status: "changed",
      message: `Coupon "${normalizedCode}" changed. Your discount was updated from Rs. ${Math.floor(previousDiscount)} to Rs. ${discount}.`,
      pricingSnapshot,
      coupon,
      discount,
      previousDiscount
    });
  }

  return buildCouponState({
    code: normalizedCode,
    status: "applied",
    message: "Coupon applied successfully!",
    pricingSnapshot,
    coupon,
    discount,
    previousDiscount
  });
}

const orderService = {
  getCheckoutData: async (userId) => {
    const addresses = await addressRepository.find({ userId });
    const validationState = await getCheckoutValidationState(userId);

    if (validationState.errors.some((error) => error.status !== "price-changed")) {
      throw {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        message: validationState.message,
        errors: validationState.errors,
        redirect: "/cart",
        cartState: validationState
      };
    }

    return {
      cart: { ...validationState.cart.toObject(), products: validationState.productsWithPrices },
      subtotal: validationState.subtotal,
      offerDiscount: validationState.offerDiscount,
      deliveryCharge: validationState.deliveryCharge,
      couponDiscount: 0,
      totalAmount: validationState.totalAmount,
      address: addresses,
      message: validationState.hasPriceChanges ? MESSAGES.ORDER.PRICE_CHANGED : null,
      validationIssues: validationState.errors,
      cartState: validationState
    };
  },

  validateCoupon: async (userId, couponCode, totalAmount) => {
    const couponState = await getCouponValidationState(
      userId,
      couponCode,
      {
        subtotal: totalAmount,
        offerDiscount: 0,
        deliveryCharge: 0,
        baseTotal: totalAmount
      }
    );

    if (couponState.status !== "applied") {
      throw {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        message: couponState.message,
        couponState
      };
    }

    return { discount: couponState.discount, couponState };
  },

  placeOrder: async (userId, orderData) => {
    const { items, totalAmount, shippingAddress, paymentMethod, couponCode } = orderData;
    let couponDiscount = 0;

    if (paymentMethod === "CashOnDelivery" && totalAmount > 1000) {
      throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.ORDER.COD_LIMIT };
    }

    const validationState = await getCheckoutValidationState(userId);
    const cart = validationState.cart;
    if (!cart || !cart.products || cart.products.length === 0) {
      throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.ORDER.CART_PROCESSED, errors: [] };
    }

    if (validationState.hasBlockingIssues) {
      throw {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        message: validationState.message || MESSAGES.ORDER.TOTAL_CHANGED,
        errors: validationState.errors,
        cartState: validationState
      };
    }

    let originalSubtotal = 0;
    let totalOfferDiscount = 0;

    for (const item of items) {
      const validatedItem = validationState.productsWithPrices.find(
        (productItem) => String(productItem.productId._id) === String(item.productId)
      );
      const product = validatedItem?.productId;
      if (!product || !product.isListed) {
        throw {
          statusCode: HTTP_STATUS.BAD_REQUEST,
          message: MESSAGES.ORDER.PRODUCT_UNAVAILABLE_CART(product ? product.name : "Unknown"),
          errors: validationState.errors
        };
      }
      if (!product.category || product.category.isListed === false) {
        throw {
          statusCode: HTTP_STATUS.BAD_REQUEST,
          message: MESSAGES.ORDER.CATEGORY_UNAVAILABLE_CART(product.name, product.category?.name || "This category"),
          errors: validationState.errors
        };
      }
      if (product.stock < item.quantity) {
        throw {
          statusCode: HTTP_STATUS.BAD_REQUEST,
          message: MESSAGES.ORDER.PRODUCT_INSUFFICIENT_STOCK(product.name, product.stock),
          errors: validationState.errors
        };
      }

      const originalPrice = product.price;
      const discountedPrice = validatedItem.discountedPrice ?? originalPrice;
      
      originalSubtotal += originalPrice * item.quantity;
      totalOfferDiscount += (originalPrice - discountedPrice) * item.quantity;
    }

    const netSubtotal = originalSubtotal - totalOfferDiscount;
    const deliveryCharge = (netSubtotal > 0 && netSubtotal < 600) ? 80 : 0;

    const pricingSnapshot = {
      subtotal: Math.floor(originalSubtotal),
      offerDiscount: Math.max(0, Math.floor(totalOfferDiscount)),
      deliveryCharge,
      baseTotal: Math.floor(netSubtotal + deliveryCharge)
    };

    if (couponCode) {
      const submittedCouponDiscount = Math.max(0, Math.floor(pricingSnapshot.baseTotal - totalAmount));
      const couponState = await getCouponValidationState(userId, couponCode, pricingSnapshot, submittedCouponDiscount);

      if (couponState.status !== "applied") {
        throw {
          statusCode: HTTP_STATUS.BAD_REQUEST,
          message: couponState.message,
          cartState: validationState,
          couponState
        };
      }

      couponDiscount = couponState.discount;
    }

    const finalTotal = Math.floor(pricingSnapshot.baseTotal - couponDiscount);
    if (Math.abs(finalTotal - totalAmount) > 0.1) {
      throw {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        message: MESSAGES.ORDER.TOTAL_CHANGED,
        cartState: validationState,
        couponState: buildCouponState({
          code: couponCode || "",
          status: "changed",
          message: MESSAGES.ORDER.TOTAL_CHANGED,
          pricingSnapshot,
          discount: couponDiscount,
          previousDiscount: Math.max(0, Math.floor(pricingSnapshot.baseTotal - totalAmount))
        })
      };
    }

    if (paymentMethod === "Wallet") {
      const wallet = await walletRepository.findOne({ userId });
      if (!wallet || wallet.balance < finalTotal) {
        throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.ORDER.WALLET_INSUFFICIENT_CHECKOUT };
      }
    }

    const customOrderId = generateOrderId();
    const orderStatus = "Pending";
    const paymentStatus = (paymentMethod === "Razorpay" || paymentMethod === "Wallet") ? "Failed" : "Pending";

    const newOrderData = {
      orderId: customOrderId,
      userId,
      items,
      totalAmount: finalTotal,
      shippingAddress,
      paymentMethod,
      paymentStatus,
      orderStatus,
      couponDiscount: couponDiscount,
      offerDiscount: Math.max(0, Math.floor(totalOfferDiscount)),
      createdAt: new Date(),
    };

    if (paymentMethod === "Wallet") {
      const wallet = await walletRepository.findOne({ userId });
      wallet.balance = roundToTwo(wallet.balance - finalTotal);
      const transaction = {
        userId,
        transactionId: await generateTransactionId(),
        amount: finalTotal,
        type: "debit",
        description: MESSAGES.ORDER.PAYMENT_DESC(customOrderId),
        orderId: customOrderId,
      };
      await Promise.all([wallet.save(), transactionRepository.save(transaction)]);
      newOrderData.paymentStatus = "Successful";
    }

    const savedOrder = await orderRepository.save(newOrderData);

    if (couponDiscount > 0 && couponCode) {
      await userRepository.updateById(userId, { $push: { usedCoupons: couponCode } });
      await couponRepository.updateByQuery({ code: couponCode }, { $inc: { usedCount: 1 } });
    }

    if (paymentMethod === "CashOnDelivery" || paymentMethod === "Wallet") {
      for (const item of items) {
        await productRepository.updateByQuery({ _id: item.productId }, { $inc: { stock: -item.quantity } });
      }
    }

    await cartRepository.updateByQuery({ user: userId }, { $set: { products: [] } });

    return savedOrder;
  },

  createRazorpayOrder: async (orderId) => {
    const order = await orderRepository.findById(orderId);
    if (!order || order.paymentStatus !== "Failed") {
      throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.ORDER.RAZORPAY_INVALID_ORDER };
    }

    const options = {
      amount: Math.round(order.totalAmount * 100),
      currency: "INR",
      receipt: `receipt_order_${orderId}`,
    };

    return await razorpayInstance.orders.create(options);
  },

  confirmRazorpayPayment: async (orderId) => {
    const order = await orderRepository.findById(orderId);
    if (!order) throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.ORDER.NOT_FOUND };

    order.paymentStatus = "Successful";
    await order.save();

    for (const item of order.items) {
      await productRepository.updateByQuery({ _id: item.productId }, { $inc: { stock: -item.quantity } });
    }
    return order;
  },

  getUserOrders: async (userId, queryParams) => {
    const { page = 1, limit = 5, search = "", sort = "latest", paymentStatus = "" } = queryParams;
    const skip = (page - 1) * limit;

    let query = { userId };
    if (search) query.orderId = { $regex: search.trim(), $options: "i" };

    let sortOptions = { createdAt: -1 };
    if (sort === "oldest") sortOptions = { createdAt: 1 };
    else if (["Pending", "Shipped", "Completed", "Cancelled", "Returned"].includes(sort)) {
      query.orderStatus = sort;
    }

    if (paymentStatus) query.paymentStatus = paymentStatus;

    const totalOrders = await orderRepository.countDocuments(query);
    const totalOrdersUnfiltered = await orderRepository.countDocuments({ userId });
    const orders = await orderRepository.find(query, sortOptions, skip, limit, {
      path: "items.productId",
      populate: { path: "category" }
    });

    return {
      orders,
      totalPages: Math.max(1, Math.ceil(totalOrders / limit)),
      totalOrders,
      totalOrdersUnfiltered,
      limit
    };
  },

  getOrderDetail: async (userId, orderId, isAdmin = false) => {
    const query = isAdmin ? { _id: orderId } : { _id: orderId, userId };
    const order = await orderRepository.findOneWithPopulate(query, {
      path: "items.productId",
      populate: { path: "category", model: "Category" }
    });
    if (!order) throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.ORDER.NOT_FOUND };

    order.returnRequests = order.returnRequests || [];

    const returnWindowMs = 7 * 24 * 60 * 60 * 1000;
    const now = new Date();

    order.items.forEach((item) => {
      const returnRequest = order.returnRequests.find(r => r.productId.toString() === item.productId._id.toString());
      item.isPending = returnRequest?.status === 'Pending';
      item.isApproved = returnRequest?.status === 'Approved';

      if (item.status === "Delivered") {
        const deliveryDate = order.updatedAt || order.orderDate;
        item.isReturnWindowClosed = now - new Date(deliveryDate) > returnWindowMs;
      } else {
        item.isReturnWindowClosed = true;
      }
    });

    if (isAdmin) {
      order.items.sort((a, b) => {
        const aReq = order.returnRequests.find(r => r.productId.equals(a.productId._id));
        const bReq = order.returnRequests.find(r => r.productId.equals(b.productId._id));
        if (aReq?.status === "Pending" && bReq?.status !== "Pending") return -1;
        if (bReq?.status === "Pending" && aReq?.status !== "Pending") return 1;
        return 0;
      });
    }

    return order;
  },

  cancelOrderItem: async (userId, orderId, productId) => {
    const order = await orderRepository.findOne({ _id: orderId, userId });
    if (!order) throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.ORDER.NOT_FOUND };

    const item = order.items.find(i => i.productId.toString() === productId);
    if (!item) throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.ORDER.PRODUCT_NOT_IN_ORDER };

    if (order.orderStatus !== "Pending" || item.status !== "Pending") {
      const currentStatus = item.status === "Pending" ? order.orderStatus : item.status;
      throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.ORDER.CANNOT_CANCEL(currentStatus) };
    }

    item.status = "Cancelled";
    await productRepository.updateById(productId, { $inc: { stock: item.quantity } });

    if (order.paymentStatus === "Successful" && (order.paymentMethod === "Razorpay" || order.paymentMethod === "Wallet")) {
        let wallet = await walletRepository.findOne({ userId });
        if (!wallet) {
          wallet = await walletRepository.save({ userId, balance: 0 });
        }
        const refundAmount = roundToTwo(item.price * item.quantity);
        wallet.balance = roundToTwo(wallet.balance + refundAmount);
        const transaction = {
            userId,
            transactionId: await generateTransactionId(),
            amount: refundAmount,
            type: "credit",
            orderId: order.orderId,
            description: MESSAGES.ORDER.CANCEL_REFUND_DESC(order.orderId),
        };
        await Promise.all([wallet.save(), transactionRepository.save(transaction)]);
    }

    const allCancelled = order.items.every(i => i.status === "Cancelled");
    if (allCancelled) order.orderStatus = "Cancelled";
    return await order.save();
  },

  submitReturnRequest: async (userId, orderId, productId, reason) => {
    const order = await orderRepository.findOne({ _id: orderId, userId });
    if (!order) throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.ORDER.NOT_FOUND };

    const item = order.items.find(i => i.productId.toString() === productId);
    if (!item) throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.ORDER.PRODUCT_NOT_IN_ORDER };

    if (item.status !== "Delivered") {
      throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.ORDER.RETURN_ONLY_DELIVERED };
    }

    if (!reason || !String(reason).trim()) {
      throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.ORDER.RETURN_REASON_REQUIRED };
    }

    const existingRequest = (order.returnRequests || []).find(r => r.productId.toString() === productId);
    if (existingRequest) {
      throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.ORDER.RETURN_ALREADY_REQUESTED };
    }

    const deliveryDate = order.updatedAt || order.orderDate;
    if (new Date() - new Date(deliveryDate) > 7 * 24 * 60 * 60 * 1000) {
        throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.ORDER.RETURN_WINDOW_CLOSED };
    }

    if (order.couponDiscount > 0) {
        throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.ORDER.RETURN_COUPON_RESTRICTION };
    }

    if (!order.returnRequests) order.returnRequests = [];
    order.returnRequests.push({ productId, reason: String(reason).trim(), requestedAt: new Date(), status: "Pending" });
    return await order.save();
  },

  getAdminOrders: async (queryParams) => {
    const normalizedQueryParams = {
      ...queryParams,
      sort: queryParams.sort || "default"
    };
    const { page = 1, limit = 6 } = normalizedQueryParams;
    const skip = (page - 1) * limit;

    const [orders, totalOrders] = await Promise.all([
      orderRepository.getAdminOrders(normalizedQueryParams, skip, limit),
      orderRepository.countAdminOrders(normalizedQueryParams)
    ]);

    return {
      orders,
      totalPages: Math.ceil(totalOrders / limit),
      totalOrders,
      limit
    };
  },

  changeItemStatus: async (orderId, productId, status) => {
    const order = await orderRepository.findById(orderId);
    if (!order) throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.ORDER.NOT_FOUND };

    const item = order.items.find(i => i.productId.equals(productId));
    if (!item) throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.ORDER.PRODUCT_NOT_IN_ORDER };

    const previousStatus = item.status;
    item.status = status;

    if (status === "Cancelled") await productRepository.updateByQuery({ _id: productId }, { $inc: { stock: item.quantity } });
    else if (previousStatus === "Cancelled") await productRepository.updateByQuery({ _id: productId }, { $inc: { stock: -item.quantity } });

    // Re-evaluate order status
    const allDelivered = order.items.every(i => i.status === "Delivered");
    const allCancelled = order.items.every(i => i.status === "Cancelled");
    const allReturned = order.items.every(i => i.status === "Returned");
    const hasCancelledOrReturned = order.items.some(i => i.status === "Cancelled" || i.status === "Returned");
    const hasActive = order.items.some(i => i.status === "Pending" || i.status === "Shipped");

    if (allDelivered) {
        order.orderStatus = "Completed";
        if (order.paymentMethod === "CashOnDelivery") order.paymentStatus = "Successful";
    } else if (allCancelled) order.orderStatus = "Cancelled";
    else if (allReturned) order.orderStatus = "Completed";
    else if (hasCancelledOrReturned && !hasActive) order.orderStatus = "Completed";
    else order.orderStatus = "Pending";

    return await order.save();
  },

  changeOrderStatus: async (orderId, newStatus) => {
    const order = await orderRepository.findById(orderId);
    if (!order || !newStatus) throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.ORDER.NOT_FOUND };
    if (newStatus === "Cancelled") throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.ORDER.ADMIN_CANNOT_CANCEL };

    if (order.orderStatus === "Pending" && newStatus !== "Shipped") throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.ORDER.PENDING_TO_SHIPPED_ONLY };
    if (order.orderStatus === "Shipped" && newStatus !== "Delivered") throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.ORDER.SHIPPED_TO_DELIVERED_ONLY };
    if (["Completed", "Cancelled", "Returned", "Delivered"].includes(order.orderStatus)) {
        throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.ORDER.CANNOT_CHANGE_STATUS(order.orderStatus) };
    }

    order.items.forEach(i => { if (i.status !== "Cancelled" && i.status !== "Returned") i.status = newStatus; });

    if (newStatus === "Shipped") order.orderStatus = "Shipped";
    else if (newStatus === "Delivered") {
        const active = order.items.filter(i => i.status !== "Cancelled" && i.status !== "Returned");
        if (order.paymentMethod === "CashOnDelivery") order.paymentStatus = "Successful";
        order.orderStatus = active.every(i => i.status === "Delivered") ? "Completed" : "Delivered";
    }

    return await order.save();
  },

  handleReturn: async (orderId, productId, action, rejectReason = "") => {
    const order = await orderRepository.findById(orderId);
    if (!order) throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.ORDER.NOT_FOUND };

    const item = order.items.find(i => i.productId.equals(productId));
    const request = order.returnRequests.find(r => r.productId.equals(productId));
    if (!item || !request) throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.ORDER.REQUEST_NOT_FOUND };
    if (request.status !== "Pending") {
      throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.ORDER.REQUEST_NOT_FOUND };
    }

    if (action === "approve") {
        item.status = "Returned";
        request.status = "Approved";
        request.rejectionReason = "";
        let wallet = await walletRepository.findOne({ userId: order.userId });
        if (!wallet) {
          wallet = await walletRepository.save({ userId: order.userId, balance: 0 });
        }
        const refundAmount = roundToTwo(item.price * item.quantity);
        wallet.balance = roundToTwo(wallet.balance + refundAmount);
        const transaction = {
            userId: order.userId,
            transactionId: await generateTransactionId(),
            amount: refundAmount,
            type: "credit",
            orderId: order.orderId,
            description: MESSAGES.ORDER.RETURN_REFUND_DESC(order.orderId),
        };
        await Promise.all([
            wallet.save(),
            transactionRepository.save(transaction),
            productRepository.updateByQuery({ _id: productId }, { $inc: { stock: item.quantity } })
        ]);
    } else if (action === "reject") {
        const normalizedReason = String(rejectReason || "").trim();
        const rejectReasonRegex = /^[A-Za-z0-9]+(?:\s+[A-Za-z0-9]+)*$/;

        if (normalizedReason.length < 5 || !/[A-Za-z]/.test(normalizedReason) || !rejectReasonRegex.test(normalizedReason)) {
          throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.ORDER.RETURN_REJECT_REASON_REQUIRED };
        }

        request.status = "Rejected";
        request.rejectionReason = normalizedReason;
    } else {
        throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.ORDER.REQUEST_NOT_FOUND };
    }

    return await order.save();
  },

  calculateTotals: async (userId) => {
    const cart = await cartRepository.findOneWithPopulate({ user: userId }, "products.productId");
    return calculateTotalsInternal(cart.products);
  },

  getSalesReportData: async (queryParams) => {
    const { reportType = "all", startDate, endDate, sort = "latest", page, limit = 6 } = queryParams;
    const safePage = page ? parseInt(page) : 1;
    const skip = (safePage - 1) * limit;

    let dateFilter = { "items.status": "Delivered" };
    const now = new Date();
    if (reportType === "daily") {
      dateFilter.orderDate = { $gte: new Date(new Date().setHours(0,0,0,0)), $lt: new Date(new Date().setHours(23,59,59,999)) };
    } else if (reportType === "monthly") {
      dateFilter.orderDate = { $gte: new Date(now.getFullYear(), now.getMonth(), 1), $lt: new Date(now.setHours(23,59,59,999)) };
    } else if (reportType === "yearly") {
      dateFilter.orderDate = { $gte: new Date(now.getFullYear(), 0, 1), $lt: new Date(now.setHours(23,59,59,999)) };
    } else if (reportType === "custom" && startDate && endDate) {
      dateFilter.orderDate = { $gte: new Date(new Date(startDate).setHours(0,0,0,0)), $lte: new Date(new Date(endDate).setHours(23,59,59,999)) };
    }

    const sortQuery = sort === "oldest" ? { orderDate: 1 } : { orderDate: -1 };

    const [orders, statsResult] = await Promise.all([
      orderRepository.find(dateFilter, sortQuery, skip, limit),
      orderRepository.getSalesReportStats(dateFilter)
    ]);

    const stats = statsResult[0] || { totalSalesCount: 0, totalOrderAmount: 0, totalDiscount: 0 };

    return {
      orders,
      totalSalesCount: stats.totalSalesCount,
      totalOrderAmount: stats.totalOrderAmount,
      totalDiscount: stats.totalDiscount,
      totalPages: Math.ceil(stats.totalSalesCount / limit),
      limit
    };
  }
};

export default orderService;
