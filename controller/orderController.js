import Order from "../model/order.js";
import Product from "../model/product.js";
import User from "../model/user.js";
import Address from "../model/userAddress.js";
import Cart from "../model/cart.js";
import Coupon from "../model/coupon.js";
import Wallet from "../model/wallet.js";
import Transaction from "../model/transaction.js";
import Razorpay from "razorpay";
import {
  roundToTwo,
  generateOrderId,
  generateTransactionId,
  getBestOffer,
} from "../utils/helper.js";
import HTTP_STATUS from "../Constants/httpStatus.js";
import MESSAGES from "../Constants/messages.js";
import { generateInvoicePdf, generateSalesReportPdf, generateSalesReportExcel } from "../utils/reportHelper.js";

const razorpayInstance = new Razorpay({
  key_id: "rzp_test_KZK1gW6B1A7B5s",
  key_secret: "ttwYmmlesedbxjWK8AF59uJq",
});

// --- USER SIDE FUNCTIONS ---

async function checkoutPage(req, res, next) {
  const userId = req.session.user?._id;
  if (!userId) {
    return res
      .status(HTTP_STATUS.UNAUTHORIZED)
      .json({ message: MESSAGES.ORDER.UNAUTHORIZED });
  }

  try {
    const cart = await Cart.findOne({ user: userId }).populate(
      "products.productId"
    );
    const addresses = await Address.find({ userId });

    if (!cart || cart.products.length === 0) {
      if (
        req.headers.accept &&
        req.headers.accept.includes("application/json")
      ) {
        return res
          .status(HTTP_STATUS.BAD_REQUEST)
          .json({ message: MESSAGES.ORDER.CART_EMPTY });
      }
      return res.redirect("/user/cart");
    }

    let subtotal = 0;
    let priceChanged = false;
    let unavailableProducts = [];
    let insufficientStockProducts = [];
    let productAvailabilityErrors = [];

    const updatedProducts = await Promise.all(
      cart.products.map(async (item) => {
        const product = item.productId;

        if (!product.isListed) {
          unavailableProducts.push(product.name);
          productAvailabilityErrors.push({ productId: product._id, status: 'unavailable', name: product.name });
          return null;
        }
        if (product.stock <= 0) {
          insufficientStockProducts.push(`${product.name} (Out of Stock)`);
          productAvailabilityErrors.push({ productId: product._id, status: 'out-of-stock', name: product.name });
          return null;
        }
        if (item.quantity > product.stock) {
          insufficientStockProducts.push(`${product.name} (Only ${product.stock} left)`);
          productAvailabilityErrors.push({ productId: product._id, status: 'low-stock', name: product.name, availableStock: product.stock });
          return null;
        }

        const bestOffer = await getBestOffer(product);
        let currentPrice = product.price;
        if (bestOffer) {
          currentPrice = bestOffer.discountedPrice;
        }

        const storedPrice = item.discountedPrice !== undefined ? item.discountedPrice : product.price;
        if (Math.abs(currentPrice - storedPrice) > 0.01) {
          priceChanged = true;
          item.discountedPrice = currentPrice;
        }

        subtotal += currentPrice * item.quantity;
        return {
          ...item.toObject(),
          productId: product.toObject ? product.toObject() : product,
          discountedPrice: currentPrice,
        };
      })
    );

    const isAjax = req.headers.accept && req.headers.accept.includes("application/json");
    if (priceChanged && !isAjax) {
      await cart.save();
    }

    if (unavailableProducts.length > 0 || insufficientStockProducts.length > 0) {
      let errorMsg = "";
      if (unavailableProducts.length > 0) {
        errorMsg += MESSAGES.ORDER.UNAVAILABLE_PRODUCTS(unavailableProducts.join(", "));
      }
      if (insufficientStockProducts.length > 0) {
        errorMsg += MESSAGES.ORDER.INSUFFICIENT_STOCK_PRODUCTS(insufficientStockProducts.join(", "));
      }

      if (req.headers.accept && req.headers.accept.includes("application/json")) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          message: errorMsg.trim(),
          errors: productAvailabilityErrors
        });
      }
      return res.redirect("/user/cart");
    }

    const availableProducts = updatedProducts.filter(p => p !== null);
    const deliveryCharge = 50;
    const totalAmount = roundToTwo(subtotal + deliveryCharge);

    let message = null;
    if (priceChanged) {
      message = MESSAGES.ORDER.PRICE_CHANGED;
    }

    if (req.headers.accept && req.headers.accept.includes("application/json")) {
      return res.status(HTTP_STATUS.OK).json({ success: true });
    }

    res.render("user/checkout", {
      cart: { ...cart.toObject(), products: availableProducts },
      subtotal: roundToTwo(subtotal),
      deliveryCharge,
      totalAmount,
      user: req.session.user,
      address: addresses,
      message,
    });
  } catch (error) {
    next(error);
  }
}

async function applyCoupon(req, res, next) {
  const { couponCode, totalAmount } = req.body;
  const userId = req.session.user ? req.session.user._id : null;

  if (!userId) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({ message: MESSAGES.ORDER.USER_NOT_AUTHENTICATED });
  }

  try {
    const coupon = await Coupon.findOne({ code: couponCode, isActive: true });
    if (!coupon) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: MESSAGES.COUPON.INVALID });
    }

    if (new Date() > coupon.expiresAt) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: MESSAGES.COUPON.EXPIRED });
    }

    const user = await User.findById(userId);
    if (user.usedCoupons.includes(couponCode)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: MESSAGES.COUPON.ALREADY_USED });
    }

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: MESSAGES.COUPON.USAGE_LIMIT_REACHED });
    }

    if (coupon.minOrderValue && totalAmount < coupon.minOrderValue) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        message: MESSAGES.COUPON.MIN_ORDER_VALUE(coupon.minOrderValue)
      });
    }

    let discountAmount =
      coupon.discountType === "flat"
        ? coupon.discountAmount
        : (coupon.discountAmount / 100) * totalAmount;

    discountAmount = roundToTwo(discountAmount);

    if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
      discountAmount = coupon.maxDiscount;
    }

    return res.status(HTTP_STATUS.OK).json({ discount: roundToTwo(discountAmount) });
  } catch (error) {
    next(error);
  }
}

async function confirmOrder(req, res, next) {
  try {
    const {
      items,
      totalAmount,
      shippingAddress,
      paymentMethod,
      couponCode,
    } = req.body;

    if (paymentMethod === "CashOnDelivery" && totalAmount > 1000) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        message: MESSAGES.ORDER.COD_LIMIT,
      });
    }

    const userId = req.session.user ? req.session.user._id : null;
    if (!userId) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ message: MESSAGES.ORDER.USER_NOT_AUTHENTICATED });
    }

    const cart = await Cart.findOne({ user: userId });
    if (!cart || !cart.products || cart.products.length === 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        message: MESSAGES.ORDER.CART_PROCESSED,
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: MESSAGES.ORDER.INVALID_ITEMS });
    }
    if (!totalAmount || isNaN(totalAmount) || totalAmount <= 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: MESSAGES.ORDER.INVALID_AMOUNT });
    }
    if (!shippingAddress) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: MESSAGES.ORDER.SHIPPING_REQUIRED });
    }
    if (!paymentMethod) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: MESSAGES.ORDER.PAYMENT_METHOD_REQUIRED });
    }

    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product || !product.isListed) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          message: MESSAGES.ORDER.PRODUCT_UNAVAILABLE_CART(product ? product.name : 'Unknown'),
        });
      }
      if (product.stock < item.quantity) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          message: MESSAGES.ORDER.PRODUCT_INSUFFICIENT_STOCK(product.name, product.stock),
        });
      }
    }

    let recalculatedTotal = 0;
    let totalOfferDiscount = 0;

    for (const item of items) {
      const product = await Product.findById(item.productId);
      const bestOffer = await getBestOffer(product);
      const price = bestOffer ? bestOffer.discountedPrice : product.price;
      recalculatedTotal += price * item.quantity;

      if (bestOffer) {
        totalOfferDiscount += (product.price - bestOffer.discountedPrice) * item.quantity;
      }
    }

    recalculatedTotal += 50;

    let discount = 0;
    if (couponCode) {
      const coupon = await Coupon.findOne({ code: couponCode, isActive: true });
      if (!coupon) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: MESSAGES.COUPON.INVALID });
      }
      if (new Date() > coupon.expiresAt) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: MESSAGES.COUPON.EXPIRED });
      }
      if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: MESSAGES.COUPON.USAGE_LIMIT_REACHED });
      }
      if (coupon.minOrderValue && recalculatedTotal < coupon.minOrderValue) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          message: MESSAGES.COUPON.MIN_ORDER_TOTAL_BELOW(recalculatedTotal, coupon.minOrderValue, couponCode)
        });
      }
      discount = coupon.discountType === "flat" ? coupon.discountAmount : (coupon.discountAmount / 100) * recalculatedTotal;
      discount = roundToTwo(discount);
      if (coupon.maxDiscount && discount > coupon.maxDiscount) {
        discount = coupon.maxDiscount;
      }
    }

    const finalTotalAmount = roundToTwo(recalculatedTotal - discount);
    if (Math.abs(finalTotalAmount - totalAmount) > 0.01) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        message: MESSAGES.ORDER.TOTAL_CHANGED,
      });
    }

    if (paymentMethod === "Wallet") {
      const wallet = await Wallet.findOne({ userId });
      if (!wallet || wallet.balance < finalTotalAmount) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          message: MESSAGES.ORDER.WALLET_INSUFFICIENT_CHECKOUT,
        });
      }
    }

    const paymentStatus = (paymentMethod === "Razorpay" || paymentMethod === "Wallet") ? "Failed" : "Pending";
    const customOrderId = generateOrderId();

    const newOrder = new Order({
      orderId: customOrderId,
      userId,
      items,
      totalAmount: finalTotalAmount,
      shippingAddress,
      paymentMethod,
      paymentStatus,
      orderStatus: "Pending",
      couponDiscount: discount,
      offerDiscount: totalOfferDiscount,
      createdAt: new Date(),
    });

    if (paymentMethod === "Wallet") {
      const wallet = await Wallet.findOne({ userId });
      if (wallet && wallet.balance >= finalTotalAmount) {
        wallet.balance = roundToTwo(wallet.balance - finalTotalAmount);
        const newTransaction = new Transaction({
          userId: userId,
          transactionId: await generateTransactionId(),
          amount: finalTotalAmount,
          type: "debit",
          description: MESSAGES.ORDER.PAYMENT_DESC(customOrderId),
          orderId: customOrderId,
        });
        await Promise.all([wallet.save(), newTransaction.save()]);
        newOrder.paymentStatus = "Successful";
      } else {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: MESSAGES.ORDER.WALLET_INSUFFICIENT });
      }
    }

    const savedOrder = await newOrder.save();
    const user = await User.findById(userId);
    if (discount > 0 && couponCode) {
      user.usedCoupons.push(couponCode);
      await user.save();
    }
    if (couponCode) {
      await Coupon.findOneAndUpdate({ code: couponCode }, { $inc: { usedCount: 1 } }, { new: true });
    }

    if (!savedOrder) {
      throw new Error(MESSAGES.ORDER.SAVE_FAILED);
    }

    if (paymentMethod === "CashOnDelivery" || paymentMethod === "Wallet") {
      for (const item of items) {
        const product = await Product.findById(item.productId);
        if (product) {
          product.stock -= item.quantity;
          await product.save();
        }
      }
    }

    await Cart.findOneAndUpdate({ user: userId }, { $set: { products: [] } });

    return res.status(HTTP_STATUS.CREATED).json({
      message: MESSAGES.ORDER.PLACED,
      orderId: savedOrder._id,
    });
  } catch (error) {
    next(error);
  }
}

async function createRazorpayOrder(req, res, next) {
  const { orderId } = req.body;
  try {
    const order = await Order.findById(orderId);
    if (!order || order.paymentStatus !== "Failed") {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.ORDER.RAZORPAY_INVALID_ORDER });
    }

    const options = {
      amount: Math.round(order.totalAmount * 100),
      currency: "INR",
      receipt: `receipt_order_${orderId}`,
    };

    const razorpayOrder = await razorpayInstance.orders.create(options);
    res.json({
      success: true,
      id: razorpayOrder.id,
      amount: razorpayOrder.amount,
    });
  } catch (error) {
    next(error);
  }
}

async function confirmRazorpayPayment(req, res, next) {
  try {
    const { orderId } = req.body;
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ message: MESSAGES.ORDER.NOT_FOUND });
    }

    order.paymentStatus = "Successful";
    await order.save();

    for (const item of order.items) {
      const product = await Product.findById(item.productId);
      if (product) {
        product.stock -= item.quantity;
        await product.save();
      }
    }

    return res.status(HTTP_STATUS.OK).json({ message: MESSAGES.ORDER.PAYMENT_CONFIRMED });
  } catch (error) {
    next(error);
  }
}

async function getOrderSuccessPage(req, res, next) {
  const { orderId } = req.query;
  try {
    const order = await Order.findById(orderId).populate("items.productId");
    if (!order) {
      return res.status(HTTP_STATUS.NOT_FOUND).send(MESSAGES.ORDER.NOT_FOUND);
    }
    res.render("user/orderSuccess", { order });
  } catch (error) {
    next(error);
  }
}

async function getUserOrders(req, res, next) {
  const userId = req.session.user._id;
  const page = parseInt(req.query.page) || 1;
  const limit = 5;
  const skip = (page - 1) * limit;
  const { search, sort, paymentStatus } = req.query;

  let query = { userId };
  if (search) {
    query.orderId = { $regex: search.trim(), $options: "i" };
  }

  let sortOptions = { createdAt: -1 };
  if (sort === "oldest") {
    sortOptions = { createdAt: 1 };
  } else if (["Pending", "Shipped", "Completed", "Cancelled", "Returned"].includes(sort)) {
    query.orderStatus = sort;
  }

  if (paymentStatus && ["Pending", "Successful", "Failed"].includes(paymentStatus)) {
    query.paymentStatus = paymentStatus;
  }

  try {
    const totalOrdersUnfiltered = await Order.countDocuments({ userId });
    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.max(1, Math.ceil(totalOrders / limit));

    const orders = await Order.find(query)
      .populate({
        path: "items.productId",
        populate: { path: "category" },
      })
      .sort(sortOptions)
      .skip(skip)
      .limit(limit);

    res.render("user/orders", {
      orders,
      user: req.session.user,
      currentPage: page,
      totalPages,
      totalOrders,
      totalOrdersUnfiltered,
      limit,
      search: search || "",
      sort: sort || "latest",
      paymentStatus: paymentStatus || ""
    });
  } catch (error) {
    next(error);
  }
}

async function getUserOrderDetails(req, res, next) {
  try {
    const userId = req.session.user._id;
    const orderId = req.params.id;
    const order = await Order.findOne({ _id: orderId, userId }).populate({
      path: "items.productId",
      populate: { path: "category" },
    });

    if (!order) {
      return res.status(HTTP_STATUS.NOT_FOUND).send(MESSAGES.ORDER.NOT_FOUND);
    }

    const returnWindowDays = 7;
    const returnWindowMs = returnWindowDays * 24 * 60 * 60 * 1000;
    const now = new Date();

    order.items.forEach((item) => {
      const returnRequest = order.returnRequests.find(req => req.productId.toString() === item.productId._id.toString());
      const rStatus = returnRequest ? returnRequest.status : null;
      item.isPending = rStatus === 'Pending';
      item.isApproved = rStatus === 'Approved';

      if (item.status === "Delivered") {
        const deliveryDate = order.updatedAt || order.orderDate;
        item.isReturnWindowClosed = now - new Date(deliveryDate) > returnWindowMs;
      } else {
        item.isReturnWindowClosed = true;
      }
    });

    res.render("user/orderDetails", { order, user: req.session.user });
  } catch (error) {
    next(error);
  }
}

async function downloadInvoice(req, res, next) {
  const userId = req.session.user._id;
  const orderId = req.params.id;

  try {
    const order = await Order.findOne({ _id: orderId, userId }).populate("items.productId");
    if (!order) {
      return res.status(HTTP_STATUS.NOT_FOUND).send(MESSAGES.ORDER.NOT_FOUND);
    }
    generateInvoicePdf(res, order);
  } catch (error) {
    next(error);
  }
}

async function cancelProduct(req, res, next) {
  const userId = req.session.user._id;
  const orderId = req.params.id;
  const productId = req.params.productId;

  try {
    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: MESSAGES.ORDER.NOT_FOUND });
    }

    const itemIndex = order.items.findIndex((item) => item.productId.toString() === productId);
    if (itemIndex === -1) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: MESSAGES.ORDER.PRODUCT_NOT_IN_ORDER });
    }

    const item = order.items[itemIndex];
    if (["Shipped", "Delivered", "Cancelled", "Returned"].includes(item.status)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: MESSAGES.ORDER.CANNOT_CANCEL(item.status),
      });
    }

    item.status = "Cancelled";
    const product = await Product.findById(item.productId);
    if (product) {
      product.stock += item.quantity;
      await product.save();
    }

    if (order.paymentMethod === "Razorpay" || order.paymentMethod === "Wallet") {
      const wallet = await Wallet.findOne({ userId: order.userId });
      if (wallet) {
        const refundAmount = roundToTwo(item.price * item.quantity);
        wallet.balance = roundToTwo(wallet.balance + refundAmount);
        const newTransaction = new Transaction({
          userId: order.userId,
          transactionId: await generateTransactionId(),
          amount: refundAmount,
          type: "credit",
          orderId: order.orderId,
          description: MESSAGES.ORDER.CANCEL_REFUND_DESC(order.orderId),
        });
        await Promise.all([wallet.save(), newTransaction.save()]);
      }
    }

    const allCancelled = order.items.every((item) => item.status === "Cancelled");
    if (allCancelled) order.orderStatus = "Cancelled";
    await order.save();

    return res.json({ success: true, message: MESSAGES.ORDER.CANCELLED });
  } catch (error) {
    next(error);
  }
}

async function returnProduct(req, res, next) {
  const userId = req.session.user._id;
  const orderId = req.params.id;
  const productId = req.params.productId;
  const { reason } = req.body;

  try {
    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: MESSAGES.ORDER.NOT_FOUND });
    }

    const itemIndex = order.items.findIndex((item) => item.productId.toString() === productId);
    if (itemIndex === -1) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: MESSAGES.ORDER.PRODUCT_NOT_IN_ORDER });
    }

    const deliveryDate = order.items[itemIndex].status === 'Delivered' ? (order.updatedAt || order.orderDate) : null;
    if (deliveryDate && (new Date() - new Date(deliveryDate) > 7 * 24 * 60 * 60 * 1000)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.ORDER.RETURN_WINDOW_CLOSED });
    }

    if (order.couponDiscount > 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.ORDER.RETURN_COUPON_RESTRICTION });
    }

    const returnRequest = {
      productId: order.items[itemIndex].productId,
      reason: reason,
      requestedAt: new Date(),
      status: "Pending",
    };

    if (!order.returnRequests) order.returnRequests = [];
    order.returnRequests.push(returnRequest);
    await order.save();

    return res.json({
      success: true,
      message: MESSAGES.ORDER.RETURN_SUBMITTED,
    });
  } catch (error) {
    next(error);
  }
}

// --- ADMIN SIDE FUNCTIONS ---

async function getAdminOrders(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 6;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";
    const sort = req.query.sort || "default";
    const paymentStatusFilter = req.query.paymentStatus || "";

    const match = {};
    if (paymentStatusFilter) match.paymentStatus = paymentStatusFilter;

    const orderStatuses = ["Pending", "Shipped", "Completed", "Cancelled", "Returned"];
    if (orderStatuses.includes(sort)) match.orderStatus = sort;

    const pipeline = [
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userDetails"
        }
      },
      { $unwind: "$userDetails" }
    ];

    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { orderId: { $regex: search, $options: "i" } },
            { "userDetails.email": { $regex: search, $options: "i" } }
          ]
        }
      });
    }

    if (Object.keys(match).length > 0) pipeline.push({ $match: match });

    pipeline.push({
      $addFields: {
        priority: {
          $cond: {
            if: { $gt: [{ $size: { $filter: { input: "$returnRequests", as: "req", cond: { $eq: ["$$req.status", "Pending"] } } } }, 0] },
            then: 1,
            else: {
              $cond: {
                if: { $and: [{ $eq: ["$orderStatus", "Pending"] }, { $eq: ["$paymentStatus", "Successful"] }] },
                then: 2,
                else: {
                  $cond: { if: { $eq: ["$orderStatus", "Shipped"] }, then: 3, else: 4 }
                }
              }
            }
          }
        }
      }
    });

    let sortObj = {};
    if (sort === "latest") sortObj = { createdAt: -1 };
    else if (sort === "oldest") sortObj = { createdAt: 1 };
    else if (sort === "default") sortObj = { priority: 1, createdAt: -1 };
    else sortObj = { createdAt: -1 };

    const countPipeline = [...pipeline, { $count: "total" }];
    const totalCountResult = await Order.aggregate(countPipeline);
    const totalOrders = totalCountResult.length > 0 ? totalCountResult[0].total : 0;
    const totalPages = Math.ceil(totalOrders / limit);

    pipeline.push({ $sort: sortObj });
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const orders = await Order.aggregate(pipeline);

    res.render("admin/orderList", {
      orders,
      currentPage: page,
      totalPages,
      limit,
      totalOrders,
      search,
      sort,
      paymentStatus: paymentStatusFilter,
      admin: req.session.admin
    });
  } catch (error) {
    next(error);
  }
}

async function changeProductStatus(req, res, next) {
  const { orderId, productId, status } = req.body;
  try {
    const order = await Order.findById(orderId);
    if (!order) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: MESSAGES.ORDER.NOT_FOUND });

    const item = order.items.find((item) => item.productId.equals(productId));
    if (!item) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: MESSAGES.ORDER.PRODUCT_NOT_IN_ORDER });

    const previousStatus = item.status;
    item.status = status;

    const product = await Product.findById(productId);
    if (product) {
      if (status === "Cancelled") product.stock += item.quantity;
      else if (previousStatus === "Cancelled") product.stock -= item.quantity;
      await product.save();
    }

    await order.save();

    const allDelivered = order.items.every((item) => item.status === "Delivered");
    const allCancelled = order.items.every((item) => item.status === "Cancelled");
    const allReturned = order.items.every((item) => item.status === "Returned");
    const hasCancelled = order.items.some((item) => item.status === "Cancelled");
    const hasReturned = order.items.some((item) => item.status === "Returned");
    const hasPending = order.items.some((item) => item.status === "Pending");
    const hasShipped = order.items.some((item) => item.status === "Shipped");

    if (allDelivered) {
      order.orderStatus = "Completed";
      if (order.paymentMethod === "CashOnDelivery") order.paymentStatus = "Successful";
    } else if (allCancelled) {
      order.orderStatus = "Cancelled";
    } else if (allReturned) {
      order.orderStatus = "Completed";
    } else if ((hasCancelled || hasReturned) && !hasPending && !hasShipped) {
      order.orderStatus = "Completed";
    } else {
      order.orderStatus = "Pending";
    }

    await order.save();
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

async function changeOrderStatus(req, res, next) {
  const { orderId, newStatus } = req.body;
  try {
    const order = await Order.findById(orderId);
    if (!order) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: MESSAGES.ORDER.NOT_FOUND });

    if (newStatus === "Cancelled") return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.ORDER.ADMIN_CANNOT_CANCEL });

    const currentStatus = order.orderStatus;
    if (currentStatus === "Pending") {
      if (newStatus !== "Shipped") return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.ORDER.PENDING_TO_SHIPPED_ONLY });
    } else if (currentStatus === "Shipped") {
      if (newStatus !== "Delivered") return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.ORDER.SHIPPED_TO_DELIVERED_ONLY });
    } else {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.ORDER.CANNOT_CHANGE_STATUS(currentStatus) });
    }

    order.items.forEach((item) => {
      if (item.status !== "Cancelled" && item.status !== "Returned") item.status = newStatus;
    });

    if (newStatus === "Shipped") {
      order.orderStatus = "Shipped";
    } else if (newStatus === "Delivered") {
      const activeItems = order.items.filter((item) => item.status !== "Cancelled" && item.status !== "Returned");
      const allActiveDelivered = activeItems.length > 0 && activeItems.every((item) => item.status === "Delivered");
      if (order.paymentMethod === "CashOnDelivery") order.paymentStatus = "Successful";
      if (allActiveDelivered) order.orderStatus = "Completed";
      else order.orderStatus = "Delivered";
    }

    await order.save();
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

async function getAdminOrderDetails(req, res, next) {
  try {
    const orderId = req.params.id;
    const order = await Order.findById(orderId).populate({
      path: "items.productId",
      populate: { path: "category", model: "Category" },
    });

    if (!order) return res.status(HTTP_STATUS.NOT_FOUND).json({ message: MESSAGES.ORDER.NOT_FOUND });

    order.items.sort((a, b) => {
      const aReturnRequest = order.returnRequests.find((req) => req.productId.equals(a.productId._id));
      const bReturnRequest = order.returnRequests.find((req) => req.productId.equals(b.productId._id));
      if (aReturnRequest && aReturnRequest.status === "Pending" && (!bReturnRequest || bReturnRequest.status !== "Pending")) return -1;
      if (bReturnRequest && bReturnRequest.status === "Pending" && (!aReturnRequest || aReturnRequest.status !== "Pending")) return 1;
      return 0;
    });

    res.json({ order });
  } catch (error) {
    next(error);
  }
}

async function getAdminOrderView(req, res, next) {
  try {
    const orderId = req.params.id;
    const order = await Order.findById(orderId).populate({
      path: "items.productId",
      populate: { path: "category", model: "Category" },
    });

    if (!order) return res.status(HTTP_STATUS.NOT_FOUND).render("404", { message: MESSAGES.ORDER.NOT_FOUND });

    order.items.sort((a, b) => {
      const aReturnRequest = order.returnRequests.find((req) => req.productId.equals(a.productId._id));
      const bReturnRequest = order.returnRequests.find((req) => req.productId.equals(b.productId._id));
      if (aReturnRequest && aReturnRequest.status === "Pending" && (!bReturnRequest || bReturnRequest.status !== "Pending")) return -1;
      if (bReturnRequest && bReturnRequest.status === "Pending" && (!aReturnRequest || aReturnRequest.status !== "Pending")) return 1;
      return 0;
    });

    const page = req.query.page || 1;
    const sort = req.query.sort || 'default';
    const search = req.query.search || '';
    const paymentStatus = req.query.paymentStatus || '';
    const backQuery = `page=${page}&sort=${sort}&search=${encodeURIComponent(search)}&paymentStatus=${paymentStatus}`;

    res.render("admin/orderView", { order, backQuery });
  } catch (error) {
    next(error);
  }
}

async function getAdminOrderDetailsJson(req, res, next) {
  try {
    const orderId = req.params.id;
    const order = await Order.findById(orderId)
      .populate({
        path: "items.productId",
        populate: { path: "category", model: "Category" },
      })
      .lean();

    if (!order) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: MESSAGES.ORDER.NOT_FOUND });
    return res.json({ success: true, order });
  } catch (error) {
    next(error);
  }
}

async function approveReturn(req, res, next) {
  const { orderId, productId, action } = req.body;
  try {
    const order = await Order.findById(orderId);
    if (!order) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: MESSAGES.ORDER.NOT_FOUND });

    const item = order.items.find((item) => item.productId.equals(productId));
    if (!item) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: MESSAGES.ORDER.PRODUCT_NOT_IN_ORDER });

    const returnRequest = order.returnRequests.find((req) => req.productId.equals(productId));
    if (!returnRequest) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: MESSAGES.ORDER.RETURN_REQUEST_NOT_FOUND });

    if (action === "approve") {
      item.status = "Returned";
      const wallet = await Wallet.findOne({ userId: order.userId });
      const returnedProduct = await Product.findById(productId);
      if (wallet && returnedProduct) {
        const refundAmount = item.price * item.quantity;
        wallet.balance += refundAmount;
        const newTransaction = new Transaction({
          userId: order.userId,
          transactionId: await generateTransactionId(),
          amount: refundAmount,
          type: "credit",
          orderId: order.orderId,
          description: MESSAGES.ORDER.RETURN_REFUND_DESC(order.orderId),
        });
        await newTransaction.save();
        await wallet.save();
      }
      if (returnedProduct) {
        returnedProduct.stock += item.quantity;
        await returnedProduct.save();
      }
      returnRequest.status = "Approved";
    } else if (action === "reject") {
      returnRequest.status = "Rejected";
    }

    await order.save();
    res.json({
      success: true,
      message: action === "approve" ? MESSAGES.ORDER.RETURN_APPROVED : MESSAGES.ORDER.RETURN_REJECTED,
    });
  } catch (error) {
    next(error);
  }
}
const getSalesReportFilter = (reportType, startDate, endDate) => {
  let dateFilter = { "items.status": "Delivered" };
  const currentDate = new Date();
  
  if (reportType === "daily") {
    dateFilter.orderDate = {
      $gte: new Date(new Date().setHours(0, 0, 0, 0)),
      $lt: new Date(new Date().setHours(23, 59, 59, 999)),
    };
  } else if (reportType === "monthly") {
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    dateFilter.orderDate = {
      $gte: startOfMonth,
      $lt: new Date(currentDate.setHours(23, 59, 59, 999)),
    };
  } else if (reportType === "yearly") {
    const startOfYear = new Date(currentDate.getFullYear(), 0, 1);
    dateFilter.orderDate = {
      $gte: startOfYear,
      $lt: new Date(currentDate.setHours(23, 59, 59, 999)),
    };
  } else if (reportType === "custom" && startDate && endDate) {
    dateFilter.orderDate = { 
      $gte: new Date(new Date(startDate).setHours(0, 0, 0, 0)), 
      $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)) 
    };
  }
  return dateFilter;
};

async function getSalesReport(req, res, next) {
  const limit = 6;
  const currentPage = parseInt(req.query.page) || 1;
  const skip = (currentPage - 1) * limit;
  const reportType = req.query.reportType || "all";
  const startDate = req.query.startDate || "";
  const endDate = req.query.endDate || "";
  const sort = req.query.sort || "latest";

  try {
    const dateFilter = getSalesReportFilter(reportType, startDate, endDate);
    const sortQuery = sort === "latest" ? { orderDate: -1 } : { orderDate: 1 };
    const orders = await Order.find(dateFilter).sort(sortQuery).skip(skip).limit(limit);
    const totalOrdersCount = await Order.countDocuments(dateFilter);
    const totalPages = Math.ceil(totalOrdersCount / limit);
    const allFilteredOrders = await Order.find(dateFilter);
    const totalSalesCount = allFilteredOrders.length;
    const totalOrderAmount = allFilteredOrders.reduce((acc, order) => acc + (order.totalAmount || 0), 0);
    const totalDiscount = allFilteredOrders.reduce((acc, order) => acc + (order.offerDiscount || 0) + (order.couponDiscount || 0), 0);
    res.render("admin/salesReport", {
      orders, currentPage, totalPages, reportType, startDate, endDate,
      sort, totalSalesCount, totalOrderAmount, totalDiscount, admin: req.session.admin,
    });
  } catch (error) {
    next(error);
  }
}

async function generateSalesReport(req, res, next) {
  const { reportType, startDate, endDate, sort } = req.body;
  try {
    const dateFilter = getSalesReportFilter(reportType, startDate, endDate);
    const sortQuery = sort === "oldest" ? { orderDate: 1 } : { orderDate: -1 };
    const orders = await Order.find(dateFilter).sort(sortQuery);
    const totalSalesCount = orders.length;
    const totalOrderAmount = orders.reduce((acc, order) => acc + (order.totalAmount || 0), 0);
    const totalDiscount = orders.reduce((acc, order) => acc + (order.offerDiscount || 0) + (order.couponDiscount || 0), 0);
    res.json({ success: true, totalSalesCount, totalOrderAmount, totalDiscount, orders });
  } catch (error) {
    next(error);
  }
}

async function downloadSalesReportPdf(req, res, next) {
  const { reportType, startDate, endDate, sort } = req.body;
  try {
    const dateFilter = getSalesReportFilter(reportType, startDate, endDate);
    const sortQuery = sort === "oldest" ? { orderDate: 1 } : { orderDate: -1 };
    const orders = await Order.find(dateFilter).sort(sortQuery);
    generateSalesReportPdf(res, orders);
  } catch (error) {
    next(error);
  }
}

async function downloadSalesReportExcel(req, res, next) {
  const { reportType, startDate, endDate, sort } = req.body;
  try {
    const dateFilter = getSalesReportFilter(reportType, startDate, endDate);
    const sortQuery = sort === "oldest" ? { orderDate: 1 } : { orderDate: -1 };
    const orders = await Order.find(dateFilter).sort(sortQuery);
    await generateSalesReportExcel(res, orders);
  } catch (error) {
    next(error);
  }
}

export {
  checkoutPage,
  applyCoupon,
  confirmOrder,
  createRazorpayOrder,
  confirmRazorpayPayment,
  getOrderSuccessPage,
  getUserOrders,
  getUserOrderDetails,
  downloadInvoice,
  cancelProduct,
  returnProduct,
  getAdminOrders,
  changeProductStatus,
  changeOrderStatus,
  getAdminOrderDetails,
  getAdminOrderView,
  getAdminOrderDetailsJson,
  approveReturn,
  getSalesReport,
  generateSalesReport,
  downloadSalesReportPdf,
  downloadSalesReportExcel,
};
