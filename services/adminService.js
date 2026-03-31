import userRepository from "../repositories/userRepository.js";
import orderRepository from "../repositories/orderRepository.js";
import reviewRepository from "../repositories/reviewRepository.js";

const adminService = {
  getDashboardData: async () => {
    const [
      usersCount,
      ordersCount,
      pendingOrdersCount,
      salesStatsResult,
      bestSellingProducts,
      bestSellingCategories,
      topRatedProducts
    ] = await Promise.all([
      userRepository.countDocuments(),
      orderRepository.countDocuments(),
      orderRepository.countDocuments({ orderStatus: "Pending" }),
      orderRepository.getSalesStats(),
      orderRepository.getBestSellingProducts(6),
      orderRepository.getBestSellingCategories(10),
      reviewRepository.getTopRatedProducts(5)
    ]);

    const salesStats = salesStatsResult[0] || {
      salesByDay: [],
      salesByWeek: [],
      salesByMonth: [],
      salesByYear: [],
      totalOrderAmount: 0
    };

    const transformKVPairs = (pairs) => {
      const obj = {};
      (pairs || []).forEach(p => {
        obj[p.k] = (obj[p.k] || 0) + p.v;
      });
      return obj;
    };

    const salesByDay = transformKVPairs(salesStats.salesByDay);
    const salesByWeek = transformKVPairs(salesStats.salesByWeek);
    const salesByYear = transformKVPairs(salesStats.salesByYear);
    
    const salesByMonth = Array(12).fill(0);
    (salesStats.salesByMonth || []).forEach(p => {
      const m = parseInt(p.k) - 1;
      if (m >= 0 && m < 12) salesByMonth[m] += p.v;
    });

    const salesByMonthFormatted = salesByMonth.map((amount, index) => ({
      month: index + 1,
      sales: amount,
    }));

    const formattedBestProducts = bestSellingProducts.map((p, index) => ({
      index: index + 1,
      name: p.product.name,
      description: p.product.description,
      images: p.product.images,
      quantity: p.totalQuantity,
      unitPrice: p.product.price,
      offerDiscount: p.totalOfferDiscount > 0 ? `₹${p.totalOfferDiscount}` : "N/A",
      totalAmount: p.totalSales >= 0 ? `₹${p.totalSales}` : "N/A",
    }));

    const formattedBestCategories = bestSellingCategories.map((c, index) => ({
      index: index + 1,
      name: c.category.name,
      discountAmount: "N/A",
      image: c.category.image,
    }));

    return {
      totalUsers: usersCount,
      totalOrders: ordersCount,
      totalOrderAmount: salesStats.totalOrderAmount,
      totalPending: pendingOrdersCount,
      salesByDay,
      salesByWeek,
      salesByMonth: salesByMonthFormatted,
      salesByYear,
      bestSellingProducts: formattedBestProducts,
      bestSellingCategories: formattedBestCategories,
      topRatedProducts
    };
  },

  getUsers: async (queryParams) => {
    const page = parseInt(queryParams.page) || 1;
    const limit = parseInt(queryParams.limit) || 6;
    const skip = (page - 1) * limit;
    const search = queryParams.search || "";
    const sort = queryParams.sort || "";

    const query = {};
    if (search) {
      query.$or = [
        { firstname: { $regex: search, $options: "i" } },
        { lastname: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }
    if (sort === "active") query.isBlocked = false;
    if (sort === "blocked") query.isBlocked = true;

    const sortOrder = sort === "oldest" ? { createdAt: 1 } : { createdAt: -1 };

    const users = await userRepository.find(query, sortOrder, skip, limit);
    const totalUsers = await userRepository.countDocuments(query);
    const totalPages = Math.ceil(totalUsers / limit);

    return { users, totalPages, totalUsers, limit };
  },

  toggleUserStatus: async (userId, sessionUserId) => {
    const user = await userRepository.findById(userId);
    if (!user) {
      const error = new Error(MESSAGES.ADMIN.USER_NOT_FOUND);
      error.statusCode = 404;
      throw error;
    }

    user.isBlocked = !user.isBlocked;
    await userRepository.save(user);

    let loggedOut = false;
    if (user.isBlocked && sessionUserId && sessionUserId.toString() === userId.toString()) {
      loggedOut = true;
    }

    return { isBlocked: user.isBlocked, loggedOut };
  }
};

export default adminService;
