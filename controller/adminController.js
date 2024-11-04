const multer = require("multer"); // Import multer
const Admin = require("../model/admin");
const User = require("../model/user"); // Import the User model
const Product = require("../model/product"); // Import the Product model
const Category = require("../model/category");
const Order = require("../model/order");
const Wallet = require("../model/wallet");
const Offer = require("../model/offer");
const Coupon = require("../model/coupon");
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");
const bcrypt = require("bcryptjs");
const path = require("path");

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
          const offerDiscount = product.offerDiscount || 0; // Use only offer discount
          const couponDiscount = item.couponDiscount || 0; // For reporting purposes

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
          productSales[productId].sales += itemTotal; // Only add item total for product sales
          productSales[productId].quantity += item.quantity;

          // Accumulate only the offer discounts for total offer discount
          productSales[productId].totalOfferDiscount += offerDiscount;
          productSales[productId].totalCouponDiscount += couponDiscount; // Keep this for reporting purposes

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
      .slice(0, 10)
      .map(([productId, { sales, quantity, totalOfferDiscount }], index) => {
        const product = productMap[productId];

        return product
          ? {
              index: index + 1,
              name: product.name,
              description: product.description, // Add the product description
              images: product.images, // Get all images
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
      req.session.admin = admin; // Store admin info in session
      res.redirect("/admin/dashboard"); // Redirect to dashboard
    } else {
      res.status(401).send("Invalid email or password"); // Incorrect login
    }
  } catch (error) {
    console.error(error);
    res.status(500).send("Error logging in");
  }
}

const productStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/products/"); // Specify product uploads directory
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}_${file.originalname}`); // Save the file with a unique name
  },
});

// Storage configuration for categories
const categoryStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/categories/"); // Specify category uploads directory
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}_${file.originalname}`); // Save the file with a unique name
  },
});

// Initialize multer for products
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

// Initialize multer for categories
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
    const page = parseInt(req.query.page) || 1; // Get current page from query, default to 1
    const limit = parseInt(req.query.limit) || 8; // Get limit from query, default to 10
    const skip = (page - 1) * limit; // Calculate how many documents to skip

    // Fetch users with pagination
    const users = await User.find().skip(skip).limit(limit);
    const totalUsers = await User.countDocuments(); // Get total count of users

    // Calculate total pages
    const totalPages = Math.ceil(totalUsers / limit);

    // Render the users list with pagination info
    res.render("admin/usersList", {
      users,
      currentPage: page,
      totalPages,
      limit,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error retrieving users");
  }
}

async function toggleUserStatus(req, res) {
  const { userId, action } = req.body;
  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send("User not found");
    }

    user.isBlocked = action === "block";
    await user.save();

    // If the user is being blocked, remove their user info from the session
    if (user.isBlocked) {
      // Remove user info from the session
      if (req.session.user && req.session.user._id === userId.toString()) {
        delete req.session.user; // Remove the user key
      }
      res.status(200).send({ isBlocked: user.isBlocked });
    } else {
      res.status(200).send({ isBlocked: user.isBlocked });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send("Error updating user status");
  }
}

async function addProduct(req, res) {
  try {
    const { name, description, category, price, stock } = req.body;

    // Check if images were uploaded
    if (!req.files || req.files.length === 0) {
      return res.status(400).send("No images uploaded");
    }

    const images = req.files.map((file) => file.path);

    const newProduct = new Product({
      name,
      description,
      category,
      price,
      stock,
      images,
    });

    await newProduct.save();
    res.redirect("/admin/products");
  } catch (error) {
    console.error("Error adding product:", error.message || error);
    res.status(500).send("Server error");
  }
}

async function getProducts(req, res) {
  const limit = 5; // Number of products per page
  const page = parseInt(req.query.page) || 1; // Get current page from query params
  const totalProducts = await Product.countDocuments(); // Get total product count
  const totalPages = Math.ceil(totalProducts / limit); // Calculate total pages

  const products = await Product.find()
    .populate("category")
    .skip((page - 1) * limit) // Skip products for previous pages
    .limit(limit); // Limit results to the current page

  const categories = await Category.find(); // Fetch categories
  res.render("admin/products", {
    products,
    categories,
    currentPage: page,
    totalPages,
    limit,
  }); // Pass limit to the view
}

async function editProduct(req, res) {
  const { id, name, description, category, price, stock } = req.body;

  // Handle deleteImages correctly
  let deleteImages = req.body.deleteImages;
  if (!Array.isArray(deleteImages)) {
    deleteImages = deleteImages ? [deleteImages] : []; // Convert to array or empty array
  }

  const existingProduct = await Product.findById(id);
  if (!existingProduct) {
    return res.status(404).send("Product not found");
  }

  const images = existingProduct.images.slice();

  if (req.files) {
    req.files.forEach((file) => {
      images.push(file.path);
    });
  }

  // Handle image deletion
  deleteImages.forEach((imagePath) => {
    const index = images.indexOf(imagePath);
    if (index > -1) {
      images.splice(index, 1);
    }
  });

  try {
    await Product.findByIdAndUpdate(
      id,
      {
        name,
        description,
        category,
        price,
        stock,
        images,
      },
      { new: true, runValidators: true }
    );

    res.redirect("/admin/products");
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).send("Error updating product");
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
  const limit = 5; // Number of categories per page
  const currentPage = parseInt(req.query.page) || 1; // Get current page from query, default to 1
  const skip = (currentPage - 1) * limit; // Calculate the number of documents to skip

  try {
    // Fetch the categories with pagination
    const categories = await Category.find().skip(skip).limit(limit);
    const totalCategories = await Category.countDocuments(); // Get total count of categories
    const totalPages = Math.ceil(totalCategories / limit); // Calculate total pages

    res.render("admin/categories", {
      categories,
      currentPage,
      totalPages,
      limit,
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
  const requestKey = `${name}_${isListed}`; // Unique key based on input

  if (ongoingRequests.has(requestKey)) {
    return res
      .status(409)
      .json({ status: false, message: "Request already in progress" });
  }

  ongoingRequests.add(requestKey); // Add to ongoing requests

  try {
    // Check if a category with the same name already exists
    const existingCategory = await Category.findOne({ name });
    if (existingCategory) {
      ongoingRequests.delete(requestKey); // Remove from ongoing requests
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
    isListed: isListed === "true", // Ensure isListed is true/false based on string comparison
  };

  if (req.file) {
    updates.image = req.file.path; // Only update image if a new one is provided
  }

  try {
    // Check if a category with the same name already exists (excluding the current category)
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
  const currentPage = parseInt(req.query.page) || 1;
  const limit = 7; // Set limit to 6 orders per page
  const offset = (currentPage - 1) * limit;

  try {
    // Fetch all orders and populate necessary fields
    const orders = await Order.find()
      .populate("userId") // Populate userId to get user details
      .populate("items.productId")
      .sort({ createdAt: -1 }); // Sort by creation date, most recent first

    // Split orders into two groups based on return request status
    const pendingOrders = orders.filter((order) =>
      order.returnRequests.some((request) => request.status === "Pending")
    );

    const otherOrders = orders.filter(
      (order) =>
        !order.returnRequests.some((request) => request.status === "Pending")
    );

    // Combine the pending orders with the other orders
    const sortedOrders = [...pendingOrders, ...otherOrders];

    // Calculate total orders and paginate
    const totalOrders = sortedOrders.length;
    const totalPages = Math.ceil(totalOrders / limit);

    // Slice the sortedOrders for the current page
    const paginatedOrders = sortedOrders.slice(offset, offset + limit);

    res.render("admin/orderList", {
      orders: paginatedOrders,
      currentPage,
      totalPages,
      limit,
      totalOrders, // Add this line
      showPagination: totalOrders > limit,
      pages: Array.from({ length: totalPages }, (_, i) => i + 1),
      hasPrevPage: currentPage > 1,
      hasNextPage: currentPage < totalPages,
      prevPage: currentPage - 1,
      nextPage: currentPage + 1,
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

    // Update the product status
    const previousStatus = item.status; // Store the previous status
    item.status = status;

    // Adjust stock based on status changes if necessary
    const product = await Product.findById(productId);
    if (product) {
      if (status === "Cancelled") {
        product.stock += item.quantity; // Add stock back if cancelled
      } else if (previousStatus === "Cancelled") {
        product.stock -= item.quantity; // Reduce stock when status changes from cancelled
      }
      await product.save();
    }

    await order.save(); // Save the order changes

    // Check the overall order status
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

    console.log(
      allDelivered,
      allCancelled,
      allReturned,
      hasCancelled,
      hasReturned,
      hasPending,
      hasShipped
    );

    if (allDelivered) {
      order.orderStatus = "Completed"; // Set order status to completed
    } else if (allCancelled) {
      order.orderStatus = "Cancelled"; // Set order status to cancelled
    } else if (allReturned) {
      order.orderStatus = "Completed"; // Set order status to cancelled
    } else if ((hasCancelled || hasReturned) && !hasPending && !hasShipped) {
      order.orderStatus = "Completed"; // Some products cancelled and none pending
    } else {
      order.orderStatus = "Pending"; // Default to pending if there are pending items
    }

    await order.save(); // Save the updated order status

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
      // Existing logic for approving the return
      item.status = "Returned";

      const wallet = await Wallet.findOne({ userId: order.userId });
      if (wallet) {
        wallet.balance += item.price * item.quantity; // Refund total price
        wallet.transactions.push({
          amount: item.price * item.quantity,
          type: "credit",
          orderId: order._id,
        });
        await wallet.save();
      }

      const product = await Product.findById(productId);
      if (product) {
        product.stock += item.quantity; // Add the quantity back to stock
        await product.save();
      }

      returnRequest.status = "Approved";
    } else if (action === "reject") {
      // Logic for rejecting the return
      returnRequest.status = "Rejected";
    }

    await order.save(); // Save the updated order

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
    const limit = 7;
    const skip = (page - 1) * limit;

    const totalOffers = await Offer.countDocuments();
    const totalPages = Math.ceil(totalOffers / limit);

    const offers = await Offer.find().skip(skip).limit(limit);
    const products = await Product.find(); // Fetch all products
    const categories = await Category.find(); // Fetch all categories

    res.render("admin/offer", {
      offers,
      products,
      categories,
      currentPage: page,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
      nextPage: page + 1,
      previousPage: page - 1,
      limit,
      lastPage: totalPages,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
}

// Add a new offer
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

  // Basic validation
  if (
    !offerFor ||
    !targetId ||
    !offerType ||
    value === undefined ||
    !expiresAt
  ) {
    return res.status(400).json({ message: "All fields are required." });
  }

  // Check if expiry date is valid (not in the past)
  const currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0); // Set to start of day for accurate comparison
  const expiryDate = new Date(expiresAt);
  if (expiryDate < currentDate) {
    return res
      .status(400)
      .json({ message: "Expiry date must be today or a future date." });
  }

  try {
    // Check for flat discount exceeding product price
    if (offerFor === "Product" && offerType === "flat") {
      const product = await Product.findById(targetId);
      if (!product) {
        return res.status(404).json({ message: "Product not found." });
      }
      if (value >= product.price) {
        return res.status(400).json({
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
      maxDiscount: offerFor === "Category" ? maxDiscount : undefined, // Set only if relevant
      minProductPrice:
        offerFor === "Category" && offerType === "flat"
          ? minProductPrice
          : undefined, // Set only if relevant
      expiresAt,
      usedCount,
    });

    await newOffer.save();
    res.status(201).json({ message: "Offer added successfully!" });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "Error adding offer", error: error.message });
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

    // Check if expiry date is valid (not in the past)
    const currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0); // Set to start of day for accurate comparison
    const expiryDate = new Date(expiresAt);
    if (expiryDate < currentDate) {
      return res
        .status(400)
        .json({ message: "Expiry date must be today or a future date." });
    }

    // Logic to check if flat discount is valid
    if (offerFor === "Product" && offerType === "flat") {
      const product = await Product.findById(targetId);
      if (value >= product.price) {
        return res.status(400).json({
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
    res.status(500).json({ message: "Error updating offer." });
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
  const limit = 7; // Number of categories per page
  const currentPage = parseInt(req.query.page) || 1; // Get current page from query, default to 1
  const skip = (currentPage - 1) * limit; // Calculate the number of documents to skip
  try {
    const coupons = await Coupon.find().skip(skip).limit(limit);
    const totalCategories = await Coupon.countDocuments(); // Get total count of categories
    const totalPages = Math.ceil(totalCategories / limit); // Calculate total pages
    res.render("admin/coupons", { coupons, currentPage, totalPages, limit });
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
    return res.status(400).json({ message: "All fields are required." });
  }

  const expirationDate = new Date(expiresAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Set to the start of the day

  if (expirationDate < today) {
    return res
      .status(400)
      .json({ message: "Expiration date must be today or later." });
  }

  // Validate discountAmount if discountType is percentage
  if (discountType === "percentage") {
    if (discountAmount <= 0 || discountAmount >= 80) {
      return res.status(400).json({
        message: "Discount amount must be greater than 0% and less than 80%.",
      });
    }
  }

  try {
    const existingCoupon = await Coupon.findOne({ code });
    if (existingCoupon) {
      return res.status(409).json({
        message: "Coupon code already exists. Please enter a new one.",
      });
    }

    const newCoupon = new Coupon({
      code,
      discountAmount,
      discountType,
      maxDiscount,
      minOrderValue,
      expiresAt,
      usageLimit,
    });
    await newCoupon.save();
    res.status(201).json({ message: "Coupon added successfully!" });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "Error adding coupon", error: error.message });
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
      return res.status(404).json({ message: "Coupon not found" });
    }

    const expirationDate = expiresAt ? new Date(expiresAt) : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to the start of the day

    if (expiresAt && expirationDate < today) {
      return res
        .status(400)
        .json({ message: "Expiration date must be today or later." });
    }

    // Check if the new code already exists (excluding the current coupon)
    if (code && code !== updatedCoupon.code) {
      const existingCoupon = await Coupon.findOne({ code });
      if (existingCoupon) {
        return res.status(409).json({
          message: "Coupon code already exists. Please enter a new one.",
        });
      }
    }

    // Validate discountAmount if discountType is percentage
    if (discountType === "percentage") {
      if (discountAmount <= 0 || discountAmount >= 80) {
        return res.status(400).json({
          message: "Discount amount must be greater than 0% and less than 80%.",
        });
      }
    }

    // Logic for maxDiscount and minOrderValue based on discountType
    if (discountType === "flat") {
      updatedCoupon.maxDiscount = 0; // Set maxDiscount to 0
      updatedCoupon.minOrderValue =
        minOrderValue !== undefined
          ? minOrderValue
          : updatedCoupon.minOrderValue; // Update if provided
    } else if (discountType === "percentage") {
      updatedCoupon.minOrderValue = 0; // Set minOrderValue to 0
      updatedCoupon.maxDiscount =
        maxDiscount !== undefined ? maxDiscount : updatedCoupon.maxDiscount; // Update if provided
    }

    // Update other fields, keeping existing values if new values are not provided
    updatedCoupon.code = code !== undefined ? code : updatedCoupon.code;
    updatedCoupon.discountAmount =
      discountAmount !== undefined
        ? discountAmount
        : updatedCoupon.discountAmount;
    updatedCoupon.discountType =
      discountType !== undefined ? discountType : updatedCoupon.discountType;
    updatedCoupon.expiresAt =
      expiresAt !== undefined ? expiresAt : updatedCoupon.expiresAt;
    updatedCoupon.usageLimit =
      usageLimit !== undefined ? usageLimit : updatedCoupon.usageLimit;

    await updatedCoupon.save();

    res
      .status(200)
      .json({ message: "Coupon updated successfully!", coupon: updatedCoupon });
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

async function getSalesReport(req, res) {
  try {
    // Fetch orders data from your database
    const orders = await Order.find();
    res.render("admin/salesReport", { orders });
  } catch (error) {
    console.error("Error fetching orders data:", error);
    res.status(500).send("Internal Server Error");
  }
}

async function generateSalesReport(req, res) {
  const { reportType, startDate, endDate } = req.body;

  // Determine the date range
  let dateFilter = {};
  if (reportType === "daily") {
    dateFilter = {
      orderDate: {
        $gte: new Date(new Date().setHours(0, 0, 0, 0)),
        $lt: new Date(new Date().setHours(23, 59, 59, 999)),
      },
    };
  } else if (reportType === "weekly") {
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay()); // Set to Sunday
    dateFilter = {
      orderDate: {
        $gte: startOfWeek,
        $lt: new Date(new Date().setHours(23, 59, 59, 999)),
      },
    };
  } else if (reportType === "monthly") {
    const startOfMonth = new Date(
      new Date().setFullYear(new Date().getFullYear(), new Date().getMonth(), 1)
    );
    dateFilter = {
      orderDate: {
        $gte: startOfMonth,
        $lt: new Date(new Date().setHours(23, 59, 59, 999)),
      },
    };
  } else if (reportType === "custom") {
    dateFilter = {
      orderDate: { $gte: new Date(startDate), $lt: new Date(endDate) },
    };
  }

  try {
    const orders = await Order.find(dateFilter);

    // Calculate totals
    const totalSalesCount = orders.length;
    const totalOrderAmount = orders.reduce(
      (acc, order) => acc + order.totalAmount,
      0
    );
    const totalDiscount = orders.reduce(
      (acc, order) => acc + order.offerDiscount + order.couponDiscount,
      0
    );

    res.json({
      totalSalesCount,
      totalOrderAmount,
      totalDiscount,
      orders,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
}

async function downloadSalesReportPdf(req, res) {
  const { reportType, startDate, endDate } = req.body; // Get filters from the request body
  const filter = {}; // Create a filter object

  if (reportType === "custom" && startDate && endDate) {
    filter.orderDate = { $gte: new Date(startDate), $lte: new Date(endDate) };
  } else if (reportType === "daily") {
    const today = new Date();
    filter.orderDate = {
      $gte: new Date(today.setHours(0, 0, 0, 0)),
      $lte: new Date(today.setHours(23, 59, 59, 999)),
    };
  }
  // Add other filtering logic for weekly and monthly as needed

  const orders = await Order.find(filter); // Use the filter in the query

  const doc = new PDFDocument({ layout: "landscape" }); // Set layout to landscape
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="sales_report.pdf"'
  );
  res.setHeader("Content-Type", "application/pdf");

  doc.pipe(res);

  // PDF Header
  doc.fontSize(25).text("Sales Report", { align: "center" });

  // Summary
  const totalSalesCount = orders.length;
  const totalOrderAmount = orders.reduce(
    (acc, order) => acc + order.totalAmount,
    0
  );
  const totalDiscount = orders.reduce(
    (acc, order) => acc + order.offerDiscount + order.couponDiscount,
    0
  );
  doc.fontSize(12).text(`Total Sales Count: ${totalSalesCount}`, 50, 120); // Adjusted y position for gap
  doc.fontSize(12).text(`Total Order Amount: ${totalOrderAmount}`, 250, 120); // Adjusted y position for gap
  doc.fontSize(12).text(`Total Discount: ${totalDiscount}`, 450, 120); // Adjusted y position for gap

  // Table Header
  doc.fontSize(12).text("Order ID", 50, 170); // Adjusted y position for gap
  doc.fontSize(12).text("Customer", 220, 170); // Adjusted y position for gap
  doc.fontSize(12).text("Offer Discount", 290, 170); // Adjusted y position for gap
  doc.fontSize(12).text("Coupon Discount", 380, 170); // Adjusted y position for gap
  doc.fontSize(12).text("Total Amount", 490, 170); // Adjusted y position for gap
  doc.fontSize(12).text("Date", 580, 170); // Adjusted y position for gap
  doc.fontSize(12).text("Status", 660, 170); // Adjusted y position for gap

  let y = 190; // Adjusted starting y position for the table
  orders.forEach((order) => {
    doc.fontSize(12).text(`${order._id}`, 50, y, { width: 170 }); // Adjusted y position for gap
    doc.fontSize(12).text(`${order.shippingAddress.fullname}`, 220, y);
    doc.fontSize(12).text(`${order.offerDiscount || "N/A"}`, 290, y);
    doc.fontSize(12).text(`${order.couponDiscount || "N/A"}`, 380, y);
    doc.fontSize(12).text(`${order.totalAmount}`, 490, y);
    doc
      .fontSize(12)
      .text(`${new Date(order.orderDate).toLocaleDateString("en-GB")}`, 580, y);
    doc.fontSize(12).text(`${order.orderStatus}`, 660, y);
    y += 20; // Adjusted y position for gap
  });

  doc.end();
}

async function downloadSalesReportExcel(req, res) {
  const { reportType, startDate, endDate } = req.body; // Get filters from the request body
  const filter = {}; // Create a filter object

  if (reportType === "custom" && startDate && endDate) {
    filter.orderDate = { $gte: new Date(startDate), $lte: new Date(endDate) };
  } else if (reportType === "daily") {
    const today = new Date();
    filter.orderDate = {
      $gte: new Date(today.setHours(0, 0, 0, 0)),
      $lte: new Date(today.setHours(23, 59, 59, 999)),
    };
  }
  // Add other filtering logic for weekly and monthly as needed

  const orders = await Order.find(filter); // Use the filter in the query
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Sales Report");

  // Add header row
  worksheet.addRow([
    "Order ID",
    "Customer",
    "Offer Discount",
    "Coupon Discount",
    "Total Amount",
    "Date",
    "Status",
  ]);

  orders.forEach((order) => {
    worksheet.addRow([
      order._id,
      order.shippingAddress.fullname,
      order.offerDiscount || "N/A",
      order.couponDiscount || "N/A",
      order.totalAmount,
      new Date(order.orderDate).toLocaleDateString("en-GB"),
      order.orderStatus,
    ]);
  });

  res.setHeader(
    "Content-Disposition",
    'attachment; filename="sales_report.xlsx"'
  );
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );

  await workbook.xlsx.write(res);
  res.end();
}

async function logout(req, res) {
  // Check if the admin is logged in
  if (req.session.admin) {
    // Remove admin info from the session
    delete req.session.admin;
  }

  // Redirect to login after logout
  res.redirect("/admin/login");
}

module.exports = {
  getLogin,
  getHome,
  getUsers,
  toggleUserStatus,
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
};
