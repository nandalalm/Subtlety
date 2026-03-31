import Order from "../model/order.js";

const orderRepository = {
  findById: async (id) => {
    return await Order.findById(id);
  },

  findByIdWithPopulate: async (id, populateOptions) => {
    return await Order.findById(id).populate(populateOptions);
  },

  findOne: async (query) => {
    return await Order.findOne(query);
  },

  findOneWithPopulate: async (query, populateOptions) => {
    return await Order.findOne(query).populate(populateOptions);
  },

  find: async (query = {}, sort = { createdAt: -1 }, skip = 0, limit = 0, populateOptions = null) => {
    let q = Order.find(query).sort(sort).skip(skip);
    if (limit > 0) q = q.limit(limit);
    if (populateOptions) q = q.populate(populateOptions);
    return await q;
  },

  countDocuments: async (query = {}) => {
    return await Order.countDocuments(query);
  },

  save: async (orderData) => {
    const order = new Order(orderData);
    return await order.save();
  },

  updateById: async (id, updateData, options = { new: true }) => {
    return await Order.findByIdAndUpdate(id, updateData, options);
  },

  aggregate: async (pipeline) => {
    return await Order.aggregate(pipeline);
  },

  getSalesStats: async () => {
    return await Order.aggregate([
      { $match: { "items.status": "Delivered" } },
      { $unwind: "$items" },
      { $match: { "items.status": "Delivered" } },
      {
        $project: {
          year: { $year: "$orderDate" },
          month: { $month: "$orderDate" },
          day: { $dateToString: { format: "%Y-%m-%d", date: "$orderDate" } },
          week: {
            $concat: [
              { $toString: { $year: "$orderDate" } },
              "-W",
              { $toString: { $isoWeek: "$orderDate" } }
            ]
          },
          itemTotal: { $subtract: [{ $multiply: ["$items.price", "$items.quantity"] }, { $ifNull: ["$items.offerDiscount", 0] }] }
        }
      },
      {
        $group: {
          _id: null,
          salesByDay: { $push: { k: "$day", v: "$itemTotal" } },
          salesByWeek: { $push: { k: "$week", v: "$itemTotal" } },
          salesByMonth: { $push: { k: { $toString: "$month" }, v: "$itemTotal" } },
          salesByYear: { $push: { k: { $toString: "$year" }, v: "$itemTotal" } },
          totalOrderAmount: { $sum: "$itemTotal" }
        }
      }
    ]);
  },

  getBestSellingProducts: async (limit = 10) => {
    return await Order.aggregate([
      { $match: { "items.status": "Delivered" } },
      { $unwind: "$items" },
      { $match: { "items.status": "Delivered" } },
      {
        $group: {
          _id: "$items.productId",
          totalQuantity: { $sum: "$items.quantity" },
          totalSales: { $sum: { $subtract: [{ $multiply: ["$items.price", "$items.quantity"] }, { $ifNull: ["$items.offerDiscount", 0] }] } },
          totalOfferDiscount: { $sum: { $ifNull: ["$items.offerDiscount", 0] } }
        }
      },
      { $sort: { totalSales: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "product"
        }
      },
      { $unwind: "$product" }
    ]);
  },

  getBestSellingCategories: async (limit = 10) => {
    return await Order.aggregate([
      { $match: { "items.status": "Delivered" } },
      { $unwind: "$items" },
      { $match: { "items.status": "Delivered" } },
      {
        $lookup: {
          from: "products",
          localField: "items.productId",
          foreignField: "_id",
          as: "product"
        }
      },
      { $unwind: "$product" },
      {
        $group: {
          _id: "$product.category",
          totalSales: { $sum: { $subtract: [{ $multiply: ["$items.price", "$items.quantity"] }, { $ifNull: ["$items.offerDiscount", 0] }] } }
        }
      },
      { $sort: { totalSales: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "_id",
          as: "category"
        }
      },
      { $unwind: "$category" }
    ]);
  },

  getAdminOrders: async (queryParams, skip, limit) => {
    const { search, sort, paymentStatus } = queryParams;
    const match = {};
    if (paymentStatus) match.paymentStatus = paymentStatus;
    const orderStatuses = ["Pending", "Shipped", "Completed", "Cancelled", "Returned"];
    if (orderStatuses.includes(sort)) match.orderStatus = sort;

    const pipeline = [
      { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "userDetails" } },
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
                  $cond: {
                    if: { $and: [{ $eq: ["$orderStatus", "Shipped"] }, { $eq: ["$paymentStatus", "Successful"] }] },
                    then: 3,
                    else: 4
                  }
                }
              }
            }
          }
        }
      }
    });

    let sortObj = { createdAt: -1 };
    if (sort === "oldest") sortObj = { createdAt: 1 };
    else if (sort === "default") sortObj = { priority: 1, createdAt: -1 };

    pipeline.push({ $sort: sortObj }, { $skip: skip }, { $limit: limit });

    return await Order.aggregate(pipeline);
  },

  countAdminOrders: async (queryParams) => {
    const { search, sort, paymentStatus } = queryParams;
    const match = {};
    if (paymentStatus) match.paymentStatus = paymentStatus;
    const orderStatuses = ["Pending", "Shipped", "Completed", "Cancelled", "Returned"];
    if (orderStatuses.includes(sort)) match.orderStatus = sort;

    const pipeline = [
      { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "userDetails" } },
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
    pipeline.push({ $count: "total" });

    const result = await Order.aggregate(pipeline);
    return result.length > 0 ? result[0].total : 0;
  },

  getSalesReportStats: async (dateFilter) => {
    return await Order.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: null,
          totalSalesCount: { $sum: 1 },
          totalOrderAmount: { $sum: "$totalAmount" },
          totalDiscount: { $sum: { $add: ["$offerDiscount", "$couponDiscount"] } }
        }
      }
    ]);
  }
};

export default orderRepository;
