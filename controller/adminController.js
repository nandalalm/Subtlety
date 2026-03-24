import Review from "../model/review.js";
import HTTP_STATUS from "../Constants/httpStatus.js";
import MESSAGES from "../Constants/messages.js";
import Product from "../model/product.js";
import Category from "../model/category.js";
import Offer from "../model/offer.js";
import Order from "../model/order.js";
import User from "../model/user.js";

function getWeekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

async function getHome(req, res, next) {
  try {
    const users = await User.find();
    const orders = await Order.find();
    const pendingOrders = await Order.find({ orderStatus: "Pending" });

    const totalUsers = users.length;
    const totalOrders = orders.length;
    let totalOrderAmount = 0;

    const salesByDay = {};
    const salesByWeek = {};
    const salesByMonth = Array(12).fill(0);
    const salesByYear = {};
    const productSales = {};
    const categorySales = {};

    const products = await Product.find().populate("category").lean();
    const categories = await Category.find().lean();
    const offers = await Offer.find({ offerFor: "Category" }).lean();

    const productMap = {};
    products.forEach((product) => {
      productMap[product._id] = product;
    });

    const categoryMap = {};
    categories.forEach((category) => {
      categoryMap[category._id] = category;
    });

    const categoryOffersMap = {};
    offers.forEach((offer) => {
      categoryOffersMap[offer.targetId] = offer;
    });

    orders.forEach((order) => {
      const orderDate = new Date(order.orderDate);
      const day = orderDate.toISOString().split("T")[0];
      const week = `${orderDate.getFullYear()}-W${String(
        getWeekNumber(orderDate)
      ).padStart(2, "0")}`;
      const month = orderDate.getMonth();
      const year = orderDate.getFullYear();

      order.items.forEach((item) => {
        const totalPrice = item.price * item.quantity;
        const isDelivered =
          item.status && item.status.trim().toLowerCase() === "delivered";

        if (isDelivered) {
          const product = productMap[item.productId];
          if (!product) return; // Skip if product doesn't exist

          const offerDiscount = product.offerDiscount || 0;
          const couponDiscount = item.couponDiscount || 0;
          const itemTotal = totalPrice - offerDiscount;

          salesByDay[day] = (salesByDay[day] || 0) + itemTotal;
          salesByWeek[week] = (salesByWeek[week] || 0) + itemTotal;
          salesByMonth[month] += itemTotal;
          salesByYear[year] = (salesByYear[year] || 0) + itemTotal;

          totalOrderAmount += totalPrice - couponDiscount;

          const productId = item.productId;
          productSales[productId] = productSales[productId] || {
            sales: 0,
            quantity: 0,
            totalOfferDiscount: 0,
            totalCouponDiscount: 0,
          };
          productSales[productId].sales += itemTotal;
          productSales[productId].quantity += item.quantity;
          productSales[productId].totalOfferDiscount += offerDiscount;
          productSales[productId].totalCouponDiscount += couponDiscount;

          if (product.category) {
            const categoryId = product.category._id;
            categorySales[categoryId] =
              (categorySales[categoryId] || 0) + itemTotal;
          }
        }
      });
    });

    const totalPending = pendingOrders.length;
    const salesByMonthFormatted = salesByMonth.map((amount, index) => ({
      month: index + 1,
      sales: amount,
    }));

    const bestSellingProducts = Object.entries(productSales)
      .sort((a, b) => b[1].sales - a[1].sales)
      .slice(0, 6)
      .map(([productId, { sales, quantity, totalOfferDiscount }], index) => {
        const product = productMap[productId];
        return product
          ? {
            index: index + 1,
            name: product.name,
            description: product.description,
            images: product.images,
            quantity,
            unitPrice: product.price,
            offerDiscount:
              totalOfferDiscount > 0 ? `₹${totalOfferDiscount}` : "N/A",
            totalAmount: sales >= 0 ? `₹${sales}` : "N/A",
          }
          : null;
      })
      .filter(Boolean);

    const bestSellingCategories = Object.entries(categorySales)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([categoryId, sales], index) => {
        const category = categoryMap[categoryId];
        const offer = categoryOffersMap[categoryId];
        const discountAmount = offer
          ? offer.offerType === "flat"
            ? offer.value
            : "N/A"
          : "N/A";

        return category
          ? {
            index: index + 1,
            name: category.name,
            discountAmount,
            image: category.image,
          }
          : null;
      })
      .filter(Boolean);

    const topRatedProducts = await Review.aggregate([
      { $match: { isListed: true } },
      {
        $group: {
          _id: "$productId",
          avgRating: { $avg: "$rating" },
          reviewCount: { $sum: 1 }
        }
      },
      { $sort: { avgRating: -1, reviewCount: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "product"
        }
      },
      { $unwind: "$product" },
      {
        $project: {
          name: "$product.name",
          image: { $arrayElemAt: ["$product.images", 0] },
          avgRating: 1,
          reviewCount: 1
        }
      }
    ]);

    res.render("admin/dashboard", {
      totalUsers,
      totalOrders,
      totalOrderAmount,
      totalPending,
      salesByDay,
      salesByWeek,
      salesByMonth: salesByMonthFormatted,
      salesByYear,
      bestSellingProducts,
      bestSellingCategories,
      topRatedProducts,
      admin: req.session.admin
    });
  } catch (error) {
    next(error);
  }
}

async function getUsers(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 6;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    const sort = req.query.sort || '';

    const query = {};
    if (search) {
      query.$or = [
        { firstname: { $regex: search, $options: 'i' } },
        { lastname: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    if (sort === 'active') query.isBlocked = false;
    if (sort === 'blocked') query.isBlocked = true;

    const sortOrder = sort === 'oldest' ? { createdAt: 1 } : { createdAt: -1 };

    const users = await User.find(query).sort(sortOrder).skip(skip).limit(limit);
    const totalUsers = await User.countDocuments(query);
    const totalPages = Math.ceil(totalUsers / limit);

    res.render('admin/usersList', {
      users,
      currentPage: page,
      totalPages,
      limit,
      search,
      sort,
      admin: req.session.admin
    });
  } catch (error) {
    next(error);
  }
}

async function toggleUserStatus(req, res, next) {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: MESSAGES.ADMIN.USER_NOT_FOUND });
    }

    user.isBlocked = !user.isBlocked;
    await user.save();

    if (user.isBlocked && req.session.user && req.session.user._id.toString() === userId.toString()) {
      delete req.session.user;
    }

    return res.status(HTTP_STATUS.OK).json({ success: true, isBlocked: user.isBlocked });
  } catch (error) {
    next(error);
  }
}

export {
  getHome,
  getUsers,
  toggleUserStatus,
};
