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
  getBestOffer
} from "../utils/helper.js";
import MESSAGES from "../Constants/messages.js";

const razorpayInstance = new Razorpay({
  key_id: "rzp_test_KZK1gW6B1A7B5s",
  key_secret: "ttwYmmlesedbxjWK8AF59uJq",
});

// Internal helper for totals
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

const orderService = {
  getCheckoutData: async (userId) => {
    const cart = await cartRepository.findOneWithPopulate({ user: userId }, "products.productId");
    const addresses = await addressRepository.find({ userId });

    if (!cart || cart.products.length === 0) {
      throw { statusCode: 400, message: MESSAGES.ORDER.CART_EMPTY, redirect: "/cart" };
    }

    let originalSubtotal = 0;
    let offerDiscount = 0;
    let priceChanged = false;
    let availabilityErrors = [];

    const updatedProducts = await Promise.all(
      cart.products.map(async (item) => {
        const product = item.productId;
        if (!product.isListed) {
          availabilityErrors.push({ productId: product._id, status: 'unavailable', name: product.name });
          return null;
        }
        if (product.stock <= 0) {
          availabilityErrors.push({ productId: product._id, status: 'out-of-stock', name: product.name });
          return null;
        }
        if (item.quantity > product.stock) {
          availabilityErrors.push({ productId: product._id, status: 'low-stock', name: product.name, availableStock: product.stock });
          return null;
        }

        const bestOffer = await getBestOffer(product);
        const currentDiscountedPrice = bestOffer ? bestOffer.discountedPrice : product.price;
        const storedPrice = item.discountedPrice || product.price;

        if (Math.abs(currentDiscountedPrice - storedPrice) > 0.01) {
          priceChanged = true;
          item.discountedPrice = currentDiscountedPrice;
        }

        originalSubtotal += product.price * item.quantity;
        offerDiscount += (product.price - currentDiscountedPrice) * item.quantity;
        
        return {
          ...item.toObject(),
          productId: {
            ...(product.toObject ? product.toObject() : product),
            bestOffer
          },
          discountedPrice: currentDiscountedPrice,
        };
      })
    );

    if (availabilityErrors.length > 0) {
      let errorMsg = "";
      availabilityErrors.forEach(err => {
        if (err.status === 'unavailable') errorMsg += MESSAGES.ORDER.UNAVAILABLE_PRODUCTS(err.name) + " ";
        else if (err.status === 'out-of-stock') errorMsg += `${err.name} (Out of Stock) `;
        else if (err.status === 'low-stock') errorMsg += `${err.name} (Only ${err.availableStock} left) `;
      });
      throw { statusCode: 400, message: errorMsg.trim(), errors: availabilityErrors, redirect: "/cart" };
    }

    if (priceChanged) await cart.save();

    originalSubtotal = Math.floor(originalSubtotal);
    offerDiscount = Math.floor(offerDiscount);
    const netTotal = originalSubtotal - offerDiscount;
    const deliveryCharge = (netTotal > 0 && netTotal < 600) ? 80 : 0;

    return {
      cart: { ...cart.toObject(), products: updatedProducts.filter(p => p !== null) },
      subtotal: originalSubtotal,
      offerDiscount: Math.max(0, offerDiscount),
      deliveryCharge,
      totalAmount: Math.floor(netTotal + deliveryCharge),
      address: addresses,
      message: priceChanged ? MESSAGES.ORDER.PRICE_CHANGED : null
    };
  },

  validateCoupon: async (userId, couponCode, totalAmount) => {
    const coupon = await couponRepository.findOne({ code: couponCode, isActive: true });
    if (!coupon) throw { statusCode: 400, message: MESSAGES.COUPON.INVALID };
    if (new Date() > coupon.expiresAt) throw { statusCode: 400, message: MESSAGES.COUPON.EXPIRED };

    const user = await userRepository.findById(userId);
    if (user.usedCoupons.includes(couponCode)) throw { statusCode: 400, message: MESSAGES.COUPON.ALREADY_USED };

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      throw { statusCode: 400, message: MESSAGES.COUPON.USAGE_LIMIT_REACHED };
    }

    if (coupon.minOrderValue && totalAmount < coupon.minOrderValue) {
      throw { statusCode: 400, message: MESSAGES.COUPON.MIN_ORDER_VALUE(coupon.minOrderValue) };
    }

    let discount = coupon.discountType === "flat" ? coupon.discountAmount : (coupon.discountAmount / 100) * totalAmount;
    discount = Math.floor(discount);
    if (coupon.maxDiscount && discount > coupon.maxDiscount) discount = coupon.maxDiscount;

    return { discount: Math.floor(discount) };
  },

  placeOrder: async (userId, orderData) => {
    const { items, totalAmount, shippingAddress, paymentMethod, couponCode } = orderData;

    if (paymentMethod === "CashOnDelivery" && totalAmount > 1000) {
      throw { statusCode: 400, message: MESSAGES.ORDER.COD_LIMIT };
    }

    const cart = await cartRepository.findOne({ user: userId });
    if (!cart || !cart.products || cart.products.length === 0) {
      throw { statusCode: 400, message: MESSAGES.ORDER.CART_PROCESSED };
    }

    let originalSubtotal = 0;
    let totalOfferDiscount = 0;

    for (const item of items) {
      const product = await productRepository.findById(item.productId);
      if (!product || !product.isListed) throw { statusCode: 400, message: MESSAGES.ORDER.PRODUCT_UNAVAILABLE_CART(product ? product.name : 'Unknown') };
      if (product.stock < item.quantity) throw { statusCode: 400, message: MESSAGES.ORDER.PRODUCT_INSUFFICIENT_STOCK(product.name, product.stock) };

      const bestOffer = await getBestOffer(product);
      const originalPrice = product.price;
      const discountedPrice = bestOffer ? bestOffer.discountedPrice : originalPrice;
      
      originalSubtotal += originalPrice * item.quantity;
      totalOfferDiscount += (originalPrice - discountedPrice) * item.quantity;
    }

    const netSubtotal = originalSubtotal - totalOfferDiscount;
    const deliveryCharge = (netSubtotal > 0 && netSubtotal < 600) ? 80 : 0;
    let couponDiscount = 0;

    if (couponCode) {
      // Validate coupon against the net amount after offer discounts + delivery? 
      // Usually coupons apply to the net total.
      const couponRes = await orderService.validateCoupon(userId, couponCode, netSubtotal + deliveryCharge);
      couponDiscount = Math.floor(couponRes.discount);
    }

    const finalTotal = Math.floor(netSubtotal + deliveryCharge - couponDiscount);
    if (Math.abs(finalTotal - totalAmount) > 0.1) {
      throw { statusCode: 400, message: MESSAGES.ORDER.TOTAL_CHANGED };
    }

    if (paymentMethod === "Wallet") {
      const wallet = await walletRepository.findOne({ userId });
      if (!wallet || wallet.balance < finalTotal) {
        throw { statusCode: 400, message: MESSAGES.ORDER.WALLET_INSUFFICIENT_CHECKOUT };
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

    if (discount > 0 && couponCode) {
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
      throw { statusCode: 400, message: MESSAGES.ORDER.RAZORPAY_INVALID_ORDER };
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
    if (!order) throw { statusCode: 404, message: MESSAGES.ORDER.NOT_FOUND };

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
    if (!order) throw { statusCode: 404, message: MESSAGES.ORDER.NOT_FOUND };

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
    if (!order) throw { statusCode: 404, message: MESSAGES.ORDER.NOT_FOUND };

    const item = order.items.find(i => i.productId.toString() === productId);
    if (!item) throw { statusCode: 404, message: MESSAGES.ORDER.PRODUCT_NOT_IN_ORDER };

    if (["Shipped", "Delivered", "Cancelled", "Returned"].includes(item.status)) {
      throw { statusCode: 400, message: MESSAGES.ORDER.CANNOT_CANCEL(item.status) };
    }

    item.status = "Cancelled";
    await productRepository.updateById(productId, { $inc: { stock: item.quantity } });

    if (order.paymentMethod === "Razorpay" || order.paymentMethod === "Wallet") {
        const wallet = await walletRepository.findOne({ userId });
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
    if (!order) throw { statusCode: 404, message: MESSAGES.ORDER.NOT_FOUND };

    const item = order.items.find(i => i.productId.toString() === productId);
    if (!item) throw { statusCode: 404, message: MESSAGES.ORDER.PRODUCT_NOT_IN_ORDER };

    const deliveryDate = item.status === 'Delivered' ? (order.updatedAt || order.orderDate) : null;
    if (deliveryDate && (new Date() - new Date(deliveryDate) > 7 * 24 * 60 * 60 * 1000)) {
        throw { statusCode: 400, message: MESSAGES.ORDER.RETURN_WINDOW_CLOSED };
    }

    if (order.couponDiscount > 0) {
        throw { statusCode: 400, message: MESSAGES.ORDER.RETURN_COUPON_RESTRICTION };
    }

    if (!order.returnRequests) order.returnRequests = [];
    order.returnRequests.push({ productId, reason, requestedAt: new Date(), status: "Pending" });
    return await order.save();
  },

  getAdminOrders: async (queryParams) => {
    const { page = 1, limit = 6 } = queryParams;
    const skip = (page - 1) * limit;

    const [orders, totalOrders] = await Promise.all([
      orderRepository.getAdminOrders(queryParams, skip, limit),
      orderRepository.countAdminOrders(queryParams)
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
    if (!order) throw { statusCode: 404, message: MESSAGES.ORDER.NOT_FOUND };

    const item = order.items.find(i => i.productId.equals(productId));
    if (!item) throw { statusCode: 404, message: MESSAGES.ORDER.PRODUCT_NOT_IN_ORDER };

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
    if (!order || !newStatus) throw { statusCode: 400, message: MESSAGES.ORDER.NOT_FOUND };
    if (newStatus === "Cancelled") throw { statusCode: 400, message: MESSAGES.ORDER.ADMIN_CANNOT_CANCEL };

    if (order.orderStatus === "Pending" && newStatus !== "Shipped") throw { statusCode: 400, message: MESSAGES.ORDER.PENDING_TO_SHIPPED_ONLY };
    if (order.orderStatus === "Shipped" && newStatus !== "Delivered") throw { statusCode: 400, message: MESSAGES.ORDER.SHIPPED_TO_DELIVERED_ONLY };
    if (["Completed", "Cancelled", "Returned", "Delivered"].includes(order.orderStatus)) {
        throw { statusCode: 400, message: MESSAGES.ORDER.CANNOT_CHANGE_STATUS(order.orderStatus) };
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

  handleReturn: async (orderId, productId, action) => {
    const order = await orderRepository.findById(orderId);
    if (!order) throw { statusCode: 404, message: MESSAGES.ORDER.NOT_FOUND };

    const item = order.items.find(i => i.productId.equals(productId));
    const request = order.returnRequests.find(r => r.productId.equals(productId));
    if (!item || !request) throw { statusCode: 404, message: "Request not found" };

    if (action === "approve") {
        item.status = "Returned";
        request.status = "Approved";
        const refundAmount = item.price * item.quantity;
        const wallet = await walletRepository.findOne({ userId: order.userId });
        const transaction = {
            userId: order.userId,
            transactionId: await generateTransactionId(),
            amount: refundAmount,
            type: "credit",
            orderId: order.orderId,
            description: MESSAGES.ORDER.RETURN_REFUND_DESC(order.orderId),
        };
        await Promise.all([
            walletRepository.updateByQuery({ userId: order.userId }, { $inc: { balance: refundAmount } }),
            transactionRepository.save(transaction),
            productRepository.updateByQuery({ _id: productId }, { $inc: { stock: item.quantity } })
        ]);
    } else {
        request.status = "Rejected";
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
