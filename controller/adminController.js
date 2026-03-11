const multer = require("multer");
const Admin = require("../model/admin");
const User = require("../model/user");
const Product = require("../model/product");
const Category = require("../model/category");
const Order = require("../model/order");
const Wallet = require("../model/wallet");
const Offer = require("../model/offer");
const Coupon = require("../model/coupon");
const Transaction = require("../model/transaction");
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");
const bcrypt = require("bcryptjs");
const path = require("path");
const Review = require("../model/review");
const { generateTransactionId } = require("./userController");
const { productStorage, categoryStorage } = require("../config/cloudinary");

function getLogin(req, res) {
  if (req.session.admin) {
    return res.redirect("/admin/dashboard");
  }
  res.render("admin/login");
}

function getWeekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

async function getHome(req, res) {
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

    // Fetch products with populated categories
    const products = await Product.find().populate("category").lean();
    const categories = await Category.find().lean();
    const offers = await Offer.find({ offerFor: "Category" }).lean();

    // Create product and category maps
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
          const offerDiscount = product.offerDiscount || 0;
          const couponDiscount = item.couponDiscount || 0;

          // Calculate the adjusted total for the item using only the offer discount
          const itemTotal = totalPrice - offerDiscount;

          // Update sales data
          salesByDay[day] = (salesByDay[day] || 0) + itemTotal;
          salesByWeek[week] = (salesByWeek[week] || 0) + itemTotal;
          salesByMonth[month] += itemTotal;
          salesByYear[year] = (salesByYear[year] || 0) + itemTotal;

          // Add to totalOrderAmount, deducting the coupon discount
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

          // Accumulate only the offer discounts for total offer discount
          productSales[productId].totalOfferDiscount += offerDiscount;
          productSales[productId].totalCouponDiscount += couponDiscount;

          const categoryId = product.category._id;
          categorySales[categoryId] =
            (categorySales[categoryId] || 0) + itemTotal;
        }
      });
    });

    const totalPending = pendingOrders.length;

    const salesByMonthFormatted = salesByMonth.map((amount, index) => ({
      month: index + 1,
      sales: amount,
    }));

    // Prepare best-selling products
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

    // Prepare best-selling categories
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

    // Prepare top-rated products
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
    console.error(error);
    res.status(500).send("Server error");
  }
}

async function loginadmin(req, res) {
  const { email, password } = req.body;

  try {
    const admin = await Admin.findOne({ email });

    if (admin && (await bcrypt.compare(password, admin.password))) {
      req.session.admin = admin;
      res.redirect("/admin/dashboard");
    } else {
      res.status(401).send("Invalid email or password");
    }
  } catch (error) {
    console.error(error);
    res.status(500).send("Error logging in");
  }
}

// Initialize multer for products using Cloudinary storage
const productUpload = multer({
  storage: productStorage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|webp/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase()
    );

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(
      new Error(
        "Error: File upload only supports the following filetypes - " +
        filetypes
      )
    );
  },
});

// Initialize multer for categories using Cloudinary storage
const categoryUpload = multer({
  storage: categoryStorage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|webp/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase()
    );

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(
      new Error(
        "Error: File upload only supports the following filetypes - " +
        filetypes
      )
    );
  },
});

async function getUsers(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 6;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    const sort = req.query.sort || ''; // 'active' | 'blocked' | ''

    // Build query
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
    console.error(error);
    res.status(500).send('Error retrieving users');
  }
}

async function toggleUserStatus(req, res) {
  try {
    const userId = req.params.id; // ID from URL param
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.isBlocked = !user.isBlocked; // Toggle current status
    await user.save();

    // If blocking a currently logged-in user, destroy their session
    if (user.isBlocked && req.session.user && req.session.user._id.toString() === userId.toString()) {
      delete req.session.user;
    }

    return res.status(200).json({ success: true, isBlocked: user.isBlocked });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

async function addProduct(req, res) {
  try {
    const { name, description, category, price, stock } = req.body;

    // Duplicate name check (case-insensitive)
    const existingProduct = await Product.findOne({
      name: { $regex: new RegExp("^" + name.trim() + "$", "i") },
    });

    if (existingProduct) {
      return res.status(400).json({
        success: false,
        message: "Product with this name already exists",
      });
    }

    // Check if images were uploaded (Min 3, Max 8)
    if (!req.files || req.files.length < 3 || req.files.length > 8) {
      return res.status(400).json({
        success: false,
        message: "You must upload between 3 and 8 images."
      });
    }

    const images = req.files.map((file) => file.path);

    const newProduct = new Product({
      name: name.trim(),
      description,
      category,
      price,
      stock,
      images,
    });

    await newProduct.save();
    return res.status(200).json({ success: true, message: "Product added successfully" });
  } catch (error) {
    console.error("Error adding product:", error.message || error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

async function getProducts(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 4;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";
    const sort = req.query.sort || "latest";

    // Build query
    let query = {};

    if (search) {
      const categories = await Category.find({
        name: { $regex: search, $options: "i" },
      });
      const categoryIds = categories.map((c) => c._id);

      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { category: { $in: categoryIds } },
      ];

      // Match price or stock if search is numeric
      const numSearch = Number(search);
      if (!isNaN(numSearch)) {
        query.$or.push({ price: numSearch }, { stock: numSearch });
      }
    }

    // Apply sort filters
    if (sort === "listed") query.isListed = true;
    if (sort === "unlisted") query.isListed = false;

    // Sort order
    let sortOrder = { createdAt: -1 };
    if (sort === "oldest") sortOrder = { createdAt: 1 };

    const products = await Product.find(query)
      .populate("category")
      .sort(sortOrder)
      .skip(skip)
      .limit(limit);

    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limit);

    const categories = await Category.find();

    res.render("admin/products", {
      products,
      categories,
      currentPage: page,
      totalPages,
      search,
      sort,
      limit,
    });
  } catch (error) {
    console.error("Error fetching products:", error.message || error);
    res.status(500).send("Internal Server Error");
  }
}

async function getAddProduct(req, res) {
  try {
    const categories = await Category.find({ isListed: true });
    res.render("admin/addProduct", { categories });
  } catch (error) {
    console.error("Error rendering add product page:", error);
    res.status(500).send("Internal Server Error");
  }
}

async function getEditProduct(req, res) {
  try {
    const { id } = req.params;
    const product = await Product.findById(id).populate("category");
    if (!product) {
      return res.status(404).send("Product not found");
    }
    const categories = await Category.find({ isListed: true });
    const page = req.query.page || 1;
    const search = req.query.search || '';
    const sort = req.query.sort || 'latest';
    res.render("admin/editProduct", { product, categories, page, search, sort });
  } catch (error) {
    console.error("Error rendering edit product page:", error);
    res.status(500).send("Internal Server Error");
  }
}


async function editProduct(req, res) {
  try {
    const { id, name, description, category, price, stock } = req.body;

    // Duplicate name check (case-insensitive, excluding itself)
    const duplicateProduct = await Product.findOne({
      name: { $regex: new RegExp("^" + name.trim() + "$", "i") },
      _id: { $ne: id },
    });

    if (duplicateProduct) {
      return res.status(400).json({
        success: false,
        message: "Product with this name already exists",
      });
    }

    const existingProduct = await Product.findById(id);
    if (!existingProduct) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // Product Price Validation against active flat offers
    const newPrice = parseFloat(price);
    const existingPrice = existingProduct.price;

    if (newPrice !== existingPrice) {
      // Find active flat offers for this product or its category
      const activeFlatOffers = await Offer.find({
        $or: [
          { targetId: id, offerFor: 'Product' },
          { targetId: category || existingProduct.category, offerFor: 'Category' }
        ],
        offerType: 'flat',
        isActive: true,
        expiresAt: { $gt: new Date() }
      });

      for (const offer of activeFlatOffers) {
        if (newPrice <= offer.value) {
          return res.status(400).json({
            success: false,
            message: `New price (₹${newPrice}) cannot be less than or equal to active flat discount (₹${offer.value})`
          });
        }
      }
    }

    // New Slot-based Image Management
    let finalImages = [];
    let imageSlots = [];

    try {
      if (req.body.imageSlots) {
        imageSlots = JSON.parse(req.body.imageSlots);
      }
    } catch (e) {
      console.error("Error parsing imageSlots:", e);
    }

    // Final Validation: 3-8 images
    if (imageSlots.length < 3 || imageSlots.length > 8) {
      return res.status(400).json({
        success: false,
        message: "Product must have between 3 and 8 images."
      });
    }

    // Process slots
    for (const slot of imageSlots) {
      if (slot.type === 'original') {
        // Keep existing image
        finalImages.push(slot.value);
      } else if (slot.type === 'new') {
        // Find the file in req.files
        const file = req.files.find(f => f.fieldname === `newImage_${slot.index}`);
        if (file) {
          finalImages.push(file.path);
        }
      }
    }

    // For Cloudinary, we don't need to manually unlink files from the server's disk
    // Cloudinary manages its own storage. 
    // For now, we follow the fresh start approach.

    const images = finalImages;

    await Product.findByIdAndUpdate(
      id,
      {
        name: name.trim(),
        description,
        category,
        price,
        stock,
        images,
      },
      { new: true, runValidators: true }
    );

    return res.status(200).json({ success: true, message: "Product updated successfully" });
  } catch (error) {
    console.error("Error updating product:", error);
    return res.status(500).json({ success: false, message: "Error updating product" });
  }
}

async function toggleProductStatus(req, res) {
  const productId = req.params.id;
  const { isListed } = req.body;

  try {
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Toggle isListed based on the incoming value
    product.isListed = !isListed;
    await product.save();

    return res
      .status(200)
      .json({ message: "Product status updated", isListed: product.isListed });
  } catch (error) {
    console.error("Error updating product status:", error);
    return res.status(500).json({ message: "Server error" });
  }
}

async function getCategories(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";
    const sort = req.query.sort || "";

    // Build query
    const query = {};
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    // Apply sort filters
    let sortOrder = { createdAt: -1 }; // Default: Latest
    if (sort === "oldest") sortOrder = { createdAt: 1 };
    if (sort === "listed") query.isListed = true;
    if (sort === "unlisted") query.isListed = false;

    // Fetch the categories with pagination and sort
    const categories = await Category.find(query).sort(sortOrder).skip(skip).limit(limit);
    const totalCategories = await Category.countDocuments(query);
    const totalPages = Math.ceil(totalCategories / limit);

    res.render("admin/categories", {
      categories,
      currentPage: page,
      totalPages,
      limit,
      search,
      sort,
      admin: req.session.admin
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error retrieving categories");
  }
}

let ongoingRequests = new Set();

async function addCategory(req, res) {
  const { name, isListed } = req.body;

  if (!req.file) {
    return res
      .status(400)
      .json({ status: false, message: "No image uploaded" });
  }

  // Check if the request is already being processed
  const requestKey = `${name}_${isListed}`;

  if (ongoingRequests.has(requestKey)) {
    return res
      .status(409)
      .json({ status: false, message: "Request already in progress" });
  }

  ongoingRequests.add(requestKey);

  try {
    // Check if a category with the same name already exists
    const existingCategory = await Category.findOne({ name });
    if (existingCategory) {
      ongoingRequests.delete(requestKey);
      return res
        .status(409)
        .json({ status: false, message: "Category already exists" });
    }

    // If not, create a new category
    const category = new Category({
      name,
      image: req.file.path,
      isListed: isListed === "true",
    });

    await category.save();
    return res
      .status(200)
      .json({ status: true, message: "Category added successfully" });
  } catch (error) {
    console.error("Error adding category:", error);
    res.status(500).json({ status: false, message: "Error adding category" });
  } finally {
    // Clean up the request key after the operation
    ongoingRequests.delete(requestKey);
  }
}

async function editCategory(req, res) {
  const { name, isListed } = req.body;
  const id = req.params.id;
  const updates = {
    name,
    isListed: isListed === "true",
  };

  if (req.file) {
    updates.image = req.file.path;
  }

  try {
    // Check if a category with the same name already exists excluding the current category
    const existingCategory = await Category.findOne({
      name: name,
      _id: { $ne: id },
    });
    if (existingCategory) {
      return res
        .status(409)
        .json({ status: false, message: "Category name already exists" });
    }

    const updatedCategory = await Category.findByIdAndUpdate(id, updates, {
      new: true,
    });
    if (!updatedCategory) {
      return res
        .status(404)
        .json({ status: false, message: "Category not found" });
    }
    res
      .status(200)
      .json({ status: true, message: "Category updated successfully" });
  } catch (error) {
    console.error("Error updating category:", error);
    res.status(500).json({ status: false, message: "Error updating category" });
  }
}

async function toggleCategoryStatus(req, res) {
  const categoryId = req.params.id;

  try {
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).send("Category not found");
    }

    // Toggle the isListed status
    category.isListed = !category.isListed;
    await category.save();

    res.status(200).send("Category status updated");
  } catch (error) {
    console.error("Error toggling category status:", error);
    res.status(500).send("Error updating category status");
  }
}

async function getOrders(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 6;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";
    const sort = req.query.sort || "default";
    const paymentStatusFilter = req.query.paymentStatus || "";

    // Match stage for search, payment status, and order status
    const match = {};
    if (paymentStatusFilter) {
      match.paymentStatus = paymentStatusFilter;
    }

    // If sort value is a specific order status, treat it as a filter
    const orderStatuses = ["Pending", "Shipped", "Completed", "Cancelled", "Returned"];
    if (orderStatuses.includes(sort)) {
      match.orderStatus = sort;
    }

    // Lookup users for email search
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

    if (Object.keys(match).length > 0) {
      pipeline.push({ $match: match });
    }

    // Add priority field for custom sorting
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
                    if: { $eq: ["$orderStatus", "Shipped"] },
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

    // Define Sort Order
    let sortObj = {};
    if (sort === "latest") {
      sortObj = { createdAt: -1 };
    } else if (sort === "oldest") {
      sortObj = { createdAt: 1 };
    } else if (sort === "default") {
      sortObj = { priority: 1, createdAt: -1 };
    } else {
      // For status-specific views, sort by latest by default
      sortObj = { createdAt: -1 };
    }

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
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
}

async function changeProductStatus(req, res) {
  const { orderId, productId, status } = req.body;

  try {
    const order = await Order.findById(orderId);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const item = order.items.find((item) => item.productId.equals(productId));
    if (!item) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found in order" });
    }

    const previousStatus = item.status;
    item.status = status;

    // Adjust stock based on status changes if necessary
    const product = await Product.findById(productId);
    if (product) {
      if (status === "Cancelled") {
        product.stock += item.quantity;
      } else if (previousStatus === "Cancelled") {
        product.stock -= item.quantity;
      }
      await product.save();
    }

    await order.save();

    const allDelivered = order.items.every(
      (item) => item.status === "Delivered"
    );
    const allCancelled = order.items.every(
      (item) => item.status === "Cancelled"
    );
    const allReturned = order.items.every((item) => item.status === "Returned");
    const hasCancelled = order.items.some(
      (item) => item.status === "Cancelled"
    );
    const hasReturned = order.items.some((item) => item.status === "Returned");
    const hasPending = order.items.some((item) => item.status === "Pending");
    const hasShipped = order.items.some((item) => item.status === "Shipped");

    if (allDelivered) {
      order.orderStatus = "Completed";
      if (order.paymentMethod === "CashOnDelivery") {
        order.paymentStatus = "Successful";
      }
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
    console.error(error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
}

async function changeOrderStatus(req, res) {
  const { orderId, newStatus } = req.body;

  try {
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (newStatus === "Cancelled") {
      return res.status(400).json({ success: false, message: "Admin cannot cancel orders from here" });
    }

    // Validate linear transition
    const currentStatus = order.orderStatus;
    if (currentStatus === "Pending") {
      if (newStatus !== "Shipped") {
        return res.status(400).json({ success: false, message: "Pending orders can only be moved to Shipped" });
      }
    } else if (currentStatus === "Shipped") {
      if (newStatus !== "Delivered") {
        return res.status(400).json({ success: false, message: "Shipped orders can only be moved to Delivered" });
      }
    } else {
      return res.status(400).json({ success: false, message: `Cannot change status from ${currentStatus}` });
    }

    // Update all non-cancelled and non-returned items to the new status
    order.items.forEach((item) => {
      if (item.status !== "Cancelled" && item.status !== "Returned") {
        item.status = newStatus;
      }
    });

    // Update the order-level status
    if (newStatus === "Shipped") {
      order.orderStatus = "Shipped";
    } else if (newStatus === "Delivered") {
      const activeItems = order.items.filter(
        (item) => item.status !== "Cancelled" && item.status !== "Returned"
      );
      const allActiveDelivered = activeItems.length > 0 && activeItems.every((item) => item.status === "Delivered");
  if (order.paymentMethod === "CashOnDelivery") {
          order.paymentStatus = "Successful";
        }
      
      if (allActiveDelivered) {
        order.orderStatus = "Completed";
      } else {
        // This case might happen if some items are still pending/shipped somehow, 
        // but with our linear flow it should generally be Completed.
        order.orderStatus = "Delivered";
      }
    }

    await order.save();
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
}

async function getOrderDetails(req, res) {
  try {
    const orderId = req.params.id;
    const order = await Order.findById(orderId).populate({
      path: "items.productId",
      populate: {
        path: "category",
        model: "Category",
      },
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Sort the items array to show products with pending return requests first
    order.items.sort((a, b) => {
      const aReturnRequest = order.returnRequests.find((req) =>
        req.productId.equals(a.productId._id)
      );
      const bReturnRequest = order.returnRequests.find((req) =>
        req.productId.equals(b.productId._id)
      );

      if (
        aReturnRequest &&
        aReturnRequest.status === "Pending" &&
        (!bReturnRequest || bReturnRequest.status !== "Pending")
      ) {
        return -1;
      }
      if (
        bReturnRequest &&
        bReturnRequest.status === "Pending" &&
        (!aReturnRequest || aReturnRequest.status !== "Pending")
      ) {
        return 1;
      }
      return 0;
    });

    res.json({ order });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
}

async function getOrderView(req, res) {
  try {
    const orderId = req.params.id;
    const order = await Order.findById(orderId).populate({
      path: "items.productId",
      populate: {
        path: "category",
        model: "Category",
      },
    });

    if (!order) {
      return res.status(404).render("404", { message: "Order not found" });
    }

    // Sort the items array to show products with pending return requests first
    order.items.sort((a, b) => {
      const aReturnRequest = order.returnRequests.find((req) =>
        req.productId.equals(a.productId._id)
      );
      const bReturnRequest = order.returnRequests.find((req) =>
        req.productId.equals(b.productId._id)
      );

      if (
        aReturnRequest &&
        aReturnRequest.status === "Pending" &&
        (!bReturnRequest || bReturnRequest.status !== "Pending")
      ) {
        return -1;
      }
      if (
        bReturnRequest &&
        bReturnRequest.status === "Pending" &&
        (!aReturnRequest || aReturnRequest.status !== "Pending")
      ) {
        return 1;
      }
      return 0;
    });

    // Build back-navigation query string from params passed via the View link
    const page = req.query.page || 1;
    const sort = req.query.sort || 'default';
    const search = req.query.search || '';
    const paymentStatus = req.query.paymentStatus || '';
    const backQuery = `page=${page}&sort=${sort}&search=${encodeURIComponent(search)}&paymentStatus=${paymentStatus}`;

    res.render("admin/orderView", { order, backQuery });
  } catch (error) {
    console.error(error);
    res.status(500).render("500", { message: "Server error" });
  }
}

async function getOrderDetailsJson(req, res) {
  try {
    const orderId = req.params.id;
    const order = await Order.findById(orderId)
      .populate({
        path: "items.productId",
        populate: { path: "category", model: "Category" },
      })
      .lean();

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    return res.json({ success: true, order });
  } catch (error) {
    console.error("getOrderDetailsJson error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

async function approveReturn(req, res) {
  const { orderId, productId, action } = req.body;

  try {
    const order = await Order.findById(orderId);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const item = order.items.find((item) => item.productId.equals(productId));
    if (!item) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found in order" });
    }

    // Update the return request status based on the action
    const returnRequest = order.returnRequests.find((req) =>
      req.productId.equals(productId)
    );
    if (!returnRequest) {
      return res
        .status(404)
        .json({ success: false, message: "Return request not found" });
    }

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
          description: `Refund for returning of order ${order.orderId}`,
        });
        await newTransaction.save();
        await wallet.save();
      }

      const product = await Product.findById(productId);
      if (product) {
        product.stock += item.quantity; // Add the quantity back to stock
        await product.save();
      }

      returnRequest.status = "Approved";
    } else if (action === "reject") {
      returnRequest.status = "Rejected";
    }

    await order.save();

    res.json({
      success: true,
      message:
        action === "approve"
          ? "Return approved successfully."
          : "Return rejected successfully.",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

async function getOffers(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 6;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";
    const sortParam = req.query.sort || "latest";

    let query = {};
    if (search) {
      const matchingProducts = await Product.find({ name: { $regex: search, $options: "i" } }).select('_id');
      const matchingCategories = await Category.find({ name: { $regex: search, $options: "i" } }).select('_id');
      const targetIds = [...matchingProducts.map(p => p._id), ...matchingCategories.map(c => c._id)];
      query.targetId = { $in: targetIds };
    }

    // Merged Sort and Filter logic
    let sortOrder = { createdAt: -1 };
    if (sortParam === "oldest") sortOrder = { createdAt: 1 };
    
    if (sortParam === "active") {
      query.isActive = true;
      query.expiresAt = { $gt: new Date() };
      sortOrder = { expiresAt: 1 };
    }
    if (sortParam === "expired") {
      query.expiresAt = { $lt: new Date() };
      sortOrder = { expiresAt: -1 };
    }
    
    // Type filters hidden in sort dropdown
    if (sortParam === "flat") query.offerType = "flat";
    if (sortParam === "percentage") query.offerType = "percentage";
    
    // Target filters hidden in sort dropdown
    if (sortParam === "Product" || sortParam === "Category") query.offerFor = sortParam;

    const offers = await Offer.find(query)
      .sort(sortOrder)
      .skip(skip)
      .limit(limit);

    const totalOffers = await Offer.countDocuments(query);
    const totalPages = Math.ceil(totalOffers / limit);

    const products = await Product.find();
    const categories = await Category.find();

    res.render("admin/offer", {
      offers,
      products,
      categories,
      currentPage: page,
      totalPages,
      search,
      sort: sortParam,
      limit,
      admin: req.session.admin
    });
  } catch (error) {
    console.error("Error in getOffers:", error);
    res.status(500).send("Server Error");
  }
}

async function addOffer(req, res) {
  const {
    offerFor,
    targetId,
    offerType,
    value,
    maxDiscount,
    minProductPrice,
    expiresAt,
    usedCount = 0,
  } = req.body;

  if (
    !offerFor ||
    !targetId ||
    !offerType ||
    value === undefined ||
    !expiresAt
  ) {
    return res.status(400).json({ message: "All fields are required." });
  }

  // Check if expiry date is valid
  const currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);
  const expiryDate = new Date(expiresAt);
  if (expiryDate < currentDate) {
    return res
      .status(400)
      .json({ success: false, message: "Expiry date must be today or a future date." });
  }

  try {
    // Check for duplicate offer
    const existingOffer = await Offer.findOne({
      targetId,
      offerType,
      value,
      expiresAt: new Date(expiresAt)
    });

    if (existingOffer) {
      return res.status(400).json({ success: false, message: "An identical offer already exists." });
    }

    // Check for flat discount exceeding product price
    if (offerFor === "Product" && offerType === "flat") {
      const product = await Product.findById(targetId);
      if (!product) {
        return res.status(404).json({ message: "Product not found." });
      }
      if (value >= product.price) {
        return res.status(400).json({
          success: false,
          message:
            "Flat discount cannot exceed or be equal to the product price.",
        });
      }
    }

    const newOffer = new Offer({
      offerFor,
      targetId,
      offerType,
      value,
      maxDiscount: offerFor === "Category" ? maxDiscount : undefined,
      minProductPrice:
        offerFor === "Category" && offerType === "flat"
          ? minProductPrice
          : undefined,
      expiresAt,
      usedCount,
    });

    await newOffer.save();
    res.status(201).json({ message: "Offer added successfully!" });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, message: "Error adding offer", error: error.message });
  }
}

async function editOffer(req, res) {
  try {
    const offerId = req.params.id;
    const {
      targetId,
      offerFor,
      offerType,
      value,
      minProductPrice,
      maxDiscount,
      expiresAt,
    } = req.body;

    // Check if expiry date is valid
    const currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0); // Set to start of day for accurate comparison
    const expiryDate = new Date(expiresAt);
    if (expiryDate < currentDate) {
      return res
        .status(400)
        .json({ success: false, message: "Expiry date must be today or a future date." });
    }

    // Check for duplicate offer
    const duplicateOffer = await Offer.findOne({
      _id: { $ne: offerId },
      targetId,
      offerType,
      value,
      expiresAt: new Date(expiresAt)
    });

    if (duplicateOffer) {
      return res.status(400).json({ success: false, message: "An identical offer already exists." });
    }

    // Check if flat discount is valid
    if (offerFor === "Product" && offerType === "flat") {
      const product = await Product.findById(targetId);
      if (value >= product.price) {
        return res.status(400).json({
          success: false,
          message:
            "Flat discount cannot exceed or be equal to the product price.",
        });
      }
    }

    // Update the offer
    const updatedOffer = await Offer.findByIdAndUpdate(
      offerId,
      {
        targetId,
        offerFor,
        offerType,
        value,
        minProductPrice,
        maxDiscount,
        expiresAt,
      },
      { new: true }
    );

    res
      .status(200)
      .json({ message: "Offer updated successfully!", offer: updatedOffer });
  } catch (error) {
    console.error("Error updating offer:", error);
    res.status(500).json({ success: false, message: "Error updating offer." });
  }
}

async function toggleOfferStatus(req, res) {
  const offerId = req.params.id;

  try {
    const offer = await Offer.findById(offerId);
    if (!offer) {
      return res.status(404).send("Offer not found");
    }

    // Toggle the isActive status
    offer.isActive = !offer.isActive;
    await offer.save();

    res.status(200).send("Offer status updated");
  } catch (error) {
    console.error("Error toggling offer status:", error);
    res.status(500).send("Error updating offer status");
  }
}

async function getCoupons(req, res) {
  const limit = 6;
  const currentPage = parseInt(req.query.page) || 1;
  const skip = (currentPage - 1) * limit;
  const search = req.query.search || "";
  const sort = req.query.sort || "latest";

  try {
    let query = {};
    const currentDate = new Date();

    // Backend Search
    if (search) {
      query.code = { $regex: search, $options: "i" };
    }

    // Backend Sort / Filter
    let sortQuery = { createdAt: -1 }; // Default: Latest

    if (sort === "oldest") {
      sortQuery = { createdAt: 1 };
    } else if (sort === "listed") {
      query.isActive = true;
    } else if (sort === "unlisted") {
      query.isActive = false;
    } else if (sort === "active") {
      query.isActive = true;
      query.expiresAt = { $gt: currentDate };
    } else if (sort === "expired") {
      query.expiresAt = { $lt: currentDate };
    } else if (sort === "flat") {
      query.discountType = "flat";
    } else if (sort === "percentage") {
      query.discountType = "percentage";
    }

    const coupons = await Coupon.find(query).sort(sortQuery).skip(skip).limit(limit);
    const totalCoupons = await Coupon.countDocuments(query);
    const totalPages = Math.ceil(totalCoupons / limit);

    res.render("admin/coupons", {
      coupons,
      currentPage,
      totalPages,
      limit,
      search,
      sort,
      admin: req.session.admin,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
}

async function addCoupon(req, res) {
  const {
    code,
    discountAmount,
    discountType,
    maxDiscount,
    minOrderValue,
    expiresAt,
    usageLimit,
  } = req.body;

  if (!code || !discountAmount || !expiresAt || !usageLimit) {
    return res.status(400).json({ success: false, message: "All fields are required." });
  }

  const expirationDate = new Date(expiresAt);
  const today = new Date();

  if (expirationDate <= today) {
    return res
      .status(400)
      .json({ success: false, message: "Expiration date must be a future date." });
  }

  // Validate discountAmount if discountType is percentage
  if (discountType === "percentage") {
    if (discountAmount <= 0 || discountAmount > 80) {
      return res.status(400).json({
        success: false,
        message: "Discount amount must be between 1% and 80%.",
      });
    }
  }

  // Validate discountAmount vs minOrderValue if discountType is flat
  if (discountType === "flat") {
    if (Number(discountAmount) >= Number(minOrderValue)) {
      return res.status(400).json({
        success: false,
        message: "Discount amount must be less than Minimum Order Value.",
      });
    }
  }

  try {
    const existingCoupon = await Coupon.findOne({ code });
    if (existingCoupon) {
      return res.status(409).json({
        success: false,
        message: "Coupon code already exists. Please enter a new one.",
      });
    }

    const newCoupon = new Coupon({
      code,
      discountAmount,
      discountType,
      maxDiscount: discountType === "flat" ? 0 : maxDiscount,
      minOrderValue: discountType === "percentage" ? 0 : minOrderValue,
      expiresAt,
      usageLimit,
    });
    await newCoupon.save();
    res.status(201).json({ success: true, message: "Coupon added successfully!" });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, message: "Error adding coupon", error: error.message });
  }
}

async function editCoupon(req, res) {
  const { id } = req.params;
  const {
    code,
    discountAmount,
    discountType,
    maxDiscount,
    minOrderValue,
    expiresAt,
    usageLimit,
  } = req.body;

  try {
    const updatedCoupon = await Coupon.findById(id);
    if (!updatedCoupon) {
      return res.status(404).json({ success: false, message: "Coupon not found" });
    }

    const expirationDate = expiresAt ? new Date(expiresAt) : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to the start of the day

    if (expiresAt && expirationDate <= today) {
      return res
        .status(400)
        .json({ success: false, message: "Expiration date must be in the future." });
    }

    // Check if the new code already exists excluding the current coupon
    if (code && code !== updatedCoupon.code) {
      const existingCoupon = await Coupon.findOne({ code });
      if (existingCoupon) {
        return res.status(409).json({
          success: false,
          message: "Coupon code already exists. Please enter a new one.",
        });
      }
    }
    // Validate discountAmount if discountType is percentage
    if (discountType === "percentage") {
      if (discountAmount <= 0 || discountAmount > 80) {
        return res.status(400).json({
          success: false,
          message: "Discount amount must be between 1% and 80%.",
        });
      }
    }

    // Validate discountAmount vs minOrderValue if discountType is flat
    if (discountType === "flat") {
      if (Number(discountAmount) >= Number(minOrderValue)) {
        return res.status(400).json({
          success: false,
          message: "Discount amount must be less than Minimum Order Value.",
        });
      }
    }

    // Update coupon fields
    updatedCoupon.code = code || updatedCoupon.code;
    updatedCoupon.discountAmount = discountAmount || updatedCoupon.discountAmount;
    updatedCoupon.discountType = discountType || updatedCoupon.discountType;
    updatedCoupon.expiresAt = expiresAt || updatedCoupon.expiresAt;
    updatedCoupon.usageLimit = usageLimit || updatedCoupon.usageLimit;

    if (discountType === "flat") {
      updatedCoupon.maxDiscount = 0;
      updatedCoupon.minOrderValue = minOrderValue;
    } else if (discountType === "percentage") {
      updatedCoupon.minOrderValue = 0;
      updatedCoupon.maxDiscount = maxDiscount;
    }

    await updatedCoupon.save();
    res.status(200).json({ success: true, message: "Coupon updated successfully!", coupon: updatedCoupon });
  } catch (error) {
    console.error("Error updating coupon:", error);
    res
      .status(500)
      .json({ message: "Error updating coupon.", error: error.message });
  }
}

async function toggleCouponStatus(req, res) {
  const { id } = req.params;

  try {
    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(404).send("Coupon not found");
    }

    coupon.isActive = !coupon.isActive;
    await coupon.save();

    const action = coupon.isActive ? "Listed" : "Unlisted";
    res.status(200).json({ message: `Coupon successfully ${action}` });
  } catch (error) {
    console.error("Error toggling coupon status:", error);
    res.status(500).send("Error updating coupon status");
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

async function getSalesReport(req, res) {
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

    const orders = await Order.find(dateFilter)
      .sort(sortQuery)
      .skip(skip)
      .limit(limit);

    const totalOrdersCount = await Order.countDocuments(dateFilter);
    const totalPages = Math.ceil(totalOrdersCount / limit);

    // Calculate totals for the entire filtered set (not just paginated)
    const allFilteredOrders = await Order.find(dateFilter);
    const totalSalesCount = allFilteredOrders.length;
    const totalOrderAmount = allFilteredOrders.reduce((acc, order) => acc + (order.totalAmount || 0), 0);
    const totalDiscount = allFilteredOrders.reduce((acc, order) => acc + (order.offerDiscount || 0) + (order.couponDiscount || 0), 0);

    res.render("admin/salesReport", {
      orders,
      currentPage,
      totalPages,
      reportType,
      startDate,
      endDate,
      sort,
      totalSalesCount,
      totalOrderAmount,
      totalDiscount,
      admin: req.session.admin,
    });
  } catch (error) {
    console.error("Error fetching sales report:", error);
    res.status(500).send("Internal Server Error");
  }
}

async function generateSalesReport(req, res) {
  const { reportType, startDate, endDate, sort } = req.body;
  try {
    const dateFilter = getSalesReportFilter(reportType, startDate, endDate);
    const sortQuery = sort === "oldest" ? { orderDate: 1 } : { orderDate: -1 };
    
    const orders = await Order.find(dateFilter).sort(sortQuery);

    const totalSalesCount = orders.length;
    const totalOrderAmount = orders.reduce((acc, order) => acc + (order.totalAmount || 0), 0);
    const totalDiscount = orders.reduce((acc, order) => acc + (order.offerDiscount || 0) + (order.couponDiscount || 0), 0);

    res.json({
      success: true,
      totalSalesCount,
      totalOrderAmount,
      totalDiscount,
      orders,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

async function downloadSalesReportPdf(req, res) {
  const { reportType, startDate, endDate, sort } = req.body;
  
  try {
    const dateFilter = getSalesReportFilter(reportType, startDate, endDate);
    const sortQuery = sort === "oldest" ? { orderDate: 1 } : { orderDate: -1 };
    const orders = await Order.find(dateFilter).sort(sortQuery);

    const doc = new PDFDocument({ layout: "landscape", margin: 50 });
    res.setHeader("Content-Disposition", 'attachment; filename="sales_report.pdf"');
    res.setHeader("Content-Type", "application/pdf");

    doc.pipe(res);

    // Classy Header
    doc.fillColor("#333").fontSize(25).text("SALES REPORT", { align: "center" });
    doc.fontSize(10).text(`Generated on: ${new Date().toLocaleString()}`, { align: "center" });
    doc.moveDown();

    const totalSalesCount = orders.length;
    const totalOrderAmount = orders.reduce((acc, order) => acc + (order.totalAmount || 0), 0);
    const totalDiscount = orders.reduce((acc, order) => acc + (order.offerDiscount || 0) + (order.couponDiscount || 0), 0);

    // Summary Boxes (Classy grey/white)
    doc.rect(50, 100, 700, 40).fill("#f8f9fa");
    doc.fillColor("#333").fontSize(12);
    doc.text(`Total Sales: ${totalSalesCount}`, 70, 115);
    doc.text(`Total Amount: Rs. ${totalOrderAmount.toFixed(2)}`, 300, 115);
    doc.text(`Total Discount: Rs. ${totalDiscount.toFixed(2)}`, 550, 115);

    doc.moveDown(3);

    // Table Header
    const tableTop = 160;
    doc.fillColor("#444").fontSize(10).font("Helvetica-Bold");
    doc.text("S.No", 50, tableTop);
    doc.text("Order ID", 75, tableTop);
    doc.text("Customer", 190, tableTop);
    doc.text("Offer Disc.", 350, tableTop);
    doc.text("Coupon Disc.", 430, tableTop);
    doc.text("Amount", 510, tableTop);
    doc.text("Date", 600, tableTop);
    doc.text("Status", 680, tableTop);

    doc.moveTo(50, tableTop + 15).lineTo(790, tableTop + 15).strokeColor("#ccc").stroke();

    let y = tableTop + 25;
    doc.font("Helvetica");
    orders.forEach((order, index) => {
      // Zebra striping
      if (index % 2 === 0) {
        doc.rect(50, y - 5, 740, 20).fill("#fbfbfb");
      }

      // Check for page break
      if (y > 500) {
        doc.addPage({ layout: "landscape", margin: 50 });
        y = 50;
        
        // Redraw Header on new page
        doc.fillColor("#444").fontSize(10).font("Helvetica-Bold");
        doc.text("S.No", 50, y);
        doc.text("Order ID", 75, y);
        doc.text("Customer", 190, y);
        doc.text("Offer Disc.", 350, y);
        doc.text("Coupon Disc.", 430, y);
        doc.text("Amount", 510, y);
        doc.text("Date", 600, y);
        doc.text("Status", 680, y);
        doc.moveTo(50, y + 15).lineTo(790, y + 15).strokeColor("#ccc").stroke();
        y += 25;
        doc.font("Helvetica");
      }

      doc.fillColor("#666").fontSize(9);
      doc.text(`${index + 1}`, 50, y);
      doc.text(`${order.orderId}`, 75, y, { width: 110 });
      doc.text(`${order.shippingAddress.fullname}`, 190, y, { width: 150 });
      doc.text(`Rs. ${(order.offerDiscount || 0).toFixed(2)}`, 350, y, { width: 75 });
      doc.text(`Rs. ${(order.couponDiscount || 0).toFixed(2)}`, 430, y, { width: 75 });
      doc.text(`Rs. ${(order.totalAmount || 0).toFixed(2)}`, 510, y, { width: 85 });
      doc.text(`${new Date(order.orderDate).toLocaleDateString("en-GB")}`, 600, y, { width: 75 });
      doc.text(`${order.orderStatus}`, 680, y, { width: 110 });
      y += 20;
    });

    doc.end();
  } catch (error) {
    console.error("PDF Export Error:", error);
    res.status(500).send("Error generating PDF");
  }
}

async function downloadSalesReportExcel(req, res) {
  const { reportType, startDate, endDate, sort } = req.body;
  
  try {
    const dateFilter = getSalesReportFilter(reportType, startDate, endDate);
    const sortQuery = sort === "oldest" ? { orderDate: 1 } : { orderDate: -1 };
    const orders = await Order.find(dateFilter).sort(sortQuery);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Sales Report");

    // Define columns with explicit widths
    worksheet.columns = [
      { header: "S.No", key: "sno", width: 5 },
      { header: "Order ID", key: "orderId", width: 25 },
      { header: "Customer", key: "customer", width: 25 },
      { header: "Offer Discount (Rs.)", key: "offerDiscount", width: 18 },
      { header: "Coupon Discount (Rs.)", key: "couponDiscount", width: 18 },
      { header: "Total Amount (Rs.)", key: "totalAmount", width: 18 },
      { header: "Date", key: "date", width: 15 },
      { header: "Status", key: "status", width: 15 },
    ];

    // Add summary row
    const totalOrderAmount = orders.reduce((acc, order) => acc + (order.totalAmount || 0), 0);
    const totalDiscount = orders.reduce((acc, order) => acc + (order.offerDiscount || 0) + (order.couponDiscount || 0), 0);

    worksheet.addRow(["Sales Report Summary"]);
    worksheet.addRow(["Total Sales", orders.length]);
    worksheet.addRow(["Total Amount", totalOrderAmount]);
    worksheet.addRow(["Total Discount", totalDiscount]);
    worksheet.addRow([]); // Gap

    // Style the summary rows
    worksheet.getRow(1).font = { bold: true, size: 14 };
    [2, 3, 4].forEach(rowNum => {
        worksheet.getRow(rowNum).font = { bold: true };
    });

    // Add table header manually since we already added rows
    const headerRow = worksheet.addRow([
      "S.No",
      "Order ID",
      "Customer",
      "Offer Discount (Rs.)",
      "Coupon Discount (Rs.)",
      "Total Amount (Rs.)",
      "Date",
      "Status",
    ]);

    // Style the header
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.eachCell(cell => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF444444" }
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    orders.forEach((order, index) => {
      const row = worksheet.addRow([
        index + 1,
        order.orderId,
        order.shippingAddress.fullname,
        order.offerDiscount || 0,
        order.couponDiscount || 0,
        order.totalAmount,
        new Date(order.orderDate).toLocaleDateString("en-GB"),
        order.orderStatus,
      ]);
      row.alignment = { vertical: "middle", horizontal: "left" };
    });

    res.setHeader("Content-Disposition", 'attachment; filename="sales_report.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Excel Export Error:", error);
    res.status(500).send("Error generating Excel");
  }
}

async function logout(req, res) {
  if (req.session.admin) {
    delete req.session.admin;
  }

  res.redirect("/admin/login");
}

async function getReviews(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";
    const sort = req.query.sort || "latest";
    const rating = req.query.rating || "";

    // Base pipeline
    const pipeline = [
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userDetails"
        }
      },
      { $unwind: "$userDetails" },
      {
        $lookup: {
          from: "products",
          localField: "productId",
          foreignField: "_id",
          as: "productDetails"
        }
      },
      { $unwind: "$productDetails" }
    ];

    // Search Match
    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { "userDetails.firstname": { $regex: search, $options: "i" } },
            { "userDetails.email": { $regex: search, $options: "i" } }
          ]
        }
      });
    }

    // Sort/Filter logic
    const matchStage = {};
    if (sort === "listed") matchStage.isListed = true;
    if (sort === "unlisted") matchStage.isListed = false;
    
    if (Object.keys(matchStage).length > 0) {
      pipeline.push({ $match: matchStage });
    }

    // Define Sort
    let sortStage = { createdAt: -1 };
    if (sort === "oldest") sortStage = { createdAt: 1 };
    
    // Rating sort overrides date sort if present
    if (rating === "rating-low") sortStage = { rating: 1 };
    if (rating === "rating-high") sortStage = { rating: -1 };

    pipeline.push({ $sort: sortStage });

    // Execute count for pagination
    const countPipeline = [...pipeline, { $count: "total" }];
    const totalCountResult = await Review.aggregate(countPipeline);
    const totalReviews = totalCountResult.length > 0 ? totalCountResult[0].total : 0;
    const totalPages = Math.ceil(totalReviews / limit);

    // Apply pagination
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    // Project results for consistency with previous populate structure
    pipeline.push({
      $project: {
        _id: 1,
        rating: 1,
        comment: 1,
        isListed: 1,
        createdAt: 1,
        productId: {
          _id: "$productDetails._id",
          name: "$productDetails.name"
        },
        userId: {
          _id: "$userDetails._id",
          firstname: "$userDetails.firstname",
          email: "$userDetails.email"
        }
      }
    });

    const reviews = await Review.aggregate(pipeline);

    res.render("admin/reviews", {
      reviews,
      currentPage: page,
      totalPages,
      limit,
      search,
      sort,
      rating,
      admin: req.session.admin
    });
  } catch (error) {
    console.error("Error fetching reviews:", error);
    res.status(500).send("Internal Server Error");
  }
}

async function toggleReviewStatus(req, res) {
  try {
    const { id } = req.params;
    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    review.isListed = !review.isListed;
    await review.save();

    res.json({ success: true, isListed: review.isListed });
  } catch (error) {
    console.error("Error toggling review status:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

module.exports = {
  getLogin,
  getHome,
  getUsers,
  toggleUserStatus,
  changeOrderStatus,
  getProducts,
  addProduct,
  editProduct,
  toggleProductStatus,
  productUpload,
  categoryUpload,
  loginadmin,
  getCategories,
  addCategory,
  editCategory,
  toggleCategoryStatus,
  getOrders,
  changeProductStatus,
  getOrderDetails,
  approveReturn,
  getOffers,
  addOffer,
  toggleOfferStatus,
  editOffer,
  getCoupons,
  addCoupon,
  editCoupon,
  toggleCouponStatus,
  getSalesReport,
  generateSalesReport,
  downloadSalesReportPdf,
  downloadSalesReportExcel,
  logout,
  getAddProduct,
  getEditProduct,
  getReviews,
  toggleReviewStatus,
  getOrderView,
  getOrderDetailsJson,
};
