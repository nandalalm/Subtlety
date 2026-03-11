const User = require("../model/user");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Product = require("../model/product");
const Category = require("../model/category");
const Cart = require("../model/cart");
const Address = require("../model/userAddress");
const Order = require("../model/order");
const Coupon = require("../model/coupon");
const nodemailer = require("nodemailer");
const path = require("path");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const Wallet = require("../model/wallet");
const Transaction = require("../model/transaction");
const Offer = require("../model/offer");
const Review = require("../model/review");
const PDFDocument = require("pdfkit");

// Helper to round to 2 decimal places
const roundToTwo = (num) => {
  return +(Math.round(num + "e+2") + "e-2");
};

// Helper to generate unique Order ID
const generateOrderId = () => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.floor(100000 + Math.random() * 900000);
  return `ORD-${date}-${random}`;
};

// Helper to generate unique Transaction ID
async function generateTransactionId() {
  return `TRA-${Date.now()}-${crypto.randomInt(1000, 9999)}`;
}

// Helper to get cart item quantities map for the current user
async function getCartItemMap(userId) {
  if (!userId) return {};
  const cart = await Cart.findOne({ user: userId });
  if (!cart) return {};
  const map = {};
  cart.products.forEach(item => {
    map[item.productId.toString()] = item.quantity;
  });
  return map;
}

function getLogin(req, res) {
  if (req.session.user) {
    return res.redirect("/user/home");
  }
  const errorMessage = req.session.errorMessage || null;
  req.session.errorMessage = null;
  res.render("user/login", { 
    errorMessage, 
    demoEmail: process.env.DEMO_USER_EMAIL || 'demoUser@gmail.com',
    demoPassword: process.env.DEMO_USER_PASSWORD || ''
  });
}

async function getSignup(req, res) {
  if (req.session.user) {
    return res.redirect("/user/home");
  }
  res.render("user/signup");
}

async function sendOtpEmail(email, otp) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  const mailOptions = {
    from: `"Subtlety Support" <${process.env.EMAIL}>`,
    to: email,
    subject: "Verify Your Subtlety Account",
    html: `
      <div style="font-family: 'Poppins', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="cid:logo" alt="Subtlety Logo" style="width: 150px;">
        </div>
        <h2 style="color: #9135ED; text-align: center;">Email Verification</h2>
        <p style="font-size: 16px; color: #333; line-height: 1.5;">
          Hello, <br><br>
          Thank you for choosing <strong>Subtlety</strong>. To complete your registration, please use the following One-Time Password (OTP):
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-size: 32px; font-weight: bold; color: #9135ED; letter-spacing: 5px; border: 2px dashed #9135ED; padding: 10px 20px; border-radius: 5px;">${otp}</span>
        </div>
        <p style="font-size: 14px; color: #666; text-align: center;">
          This OTP is valid for <strong>60 seconds</strong>. For security reasons, please do not share this code with anyone.
        </p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="font-size: 12px; color: #999; text-align: center;">
          If you didn't request this email, you can safely ignore it. <br>
          &copy; ${new Date().getFullYear()} Subtlety. All rights reserved.
        </p>
      </div>
    `,
    attachments: [{
      filename: 'logo.png',
      path: path.join(__dirname, '../public/images/logo-bg-removed.png'),
      cid: 'logo'
    }]
  };

  await transporter.sendMail(mailOptions);
}

// Add user and send OTP
async function addUser(req, res) {
  const { firstname, lastname, email, password, referral } = req.body;

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).send("User already exists");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = String(crypto.randomInt(100000, 999999));
    const otpTimestamp = Date.now();

    // Store user data temporarily in the session
    req.session.tempUser = {
      firstname,
      lastname,
      email,
      password: hashedPassword,
      otp,
      otpTimestamp,
    };

    // Store referral user ID if any in the session
    if (referral) {
      req.session.referralUserId = referral;
    }

    await sendOtpEmail(email, otp);

    res.status(200).json({ message: "OTP sent to your email. Please verify." });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error registering user");
  }
}

async function verifyOtp(req, res) {
  const { email, otp, referral } = req.body;

  try {
    const tempUser = req.session.tempUser;

    if (
      !tempUser ||
      tempUser.email !== email ||
      String(tempUser.otp) !== String(otp)
    ) {
      return res.status(400).send("Invalid OTP or user data not found");
    }

    const otpValidityDuration = 60 * 1000;
    if (Date.now() - tempUser.otpTimestamp > otpValidityDuration) {
      return res.status(400).send("OTP has expired. Please request a new one.");
    }

    const newUser = new User({
      firstname: tempUser.firstname,
      lastname: tempUser.lastname,
      email: tempUser.email,
      password: tempUser.password,
      isVerified: true,
    });

    await newUser.save();

    req.session.tempUser = null;

    if (referral) {
      const referralUser = await User.findById(referral);

      // Check if the referral user exists and hasn't already been credited
      if (referralUser && !referralUser.referralCreditsClaimed) {

        let wallet = await Wallet.findOne({ userId: referralUser });
        if (!wallet) {
          wallet = new Wallet({ userId: referralUser._id, balance: 0 });
        }

        const amount = 600;
        wallet.balance = roundToTwo(wallet.balance + amount);

        const newTransaction = new Transaction({
          userId: referralUser._id,
          transactionId: await generateTransactionId(),
          amount: amount,
          type: "credit",
          description: "Referral reward for referring a new user",
        });

        await Promise.all([wallet.save(), newTransaction.save()]);

        referralUser.referralCreditsClaimed = true;
        await referralUser.save();
      }
    }

    req.session.user = newUser;
    res.status(200).json({ message: "OTP verified. Redirecting...", redirect: "/user/home" });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error verifying OTP");
  }
}

async function resendOtp(req, res) {
  const { email } = req.body;

  try {
    // Check if user data is in the session
    const tempUser = req.session.tempUser;

    if (!tempUser || tempUser.email !== email) {
      return res
        .status(400)
        .send("User not found in session. Please register again.");
    }

    const otp = String(crypto.randomInt(100000, 999999));
    const otpTimestamp = Date.now();

    tempUser.otp = otp;
    tempUser.otpTimestamp = otpTimestamp;

    await sendOtpEmail(email, otp);

    res.status(200).json({ message: "New OTP sent to your email." });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error resending OTP");
  }
}

async function loginUser(req, res) {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      req.session.errorMessage = "Invalid email or password";
      return res.redirect("/user/login");
    }

    if (!user.password) {
      req.session.errorMessage = "This account was created via Google. Please use 'Login with Google'.";
      return res.redirect("/user/login");
    }

    if (!password || !user.password || !(await bcrypt.compare(password, user.password))) {
      req.session.errorMessage = "Invalid email or password";
      return res.redirect("/user/login");
    }

    if (user.isBlocked) {
      req.session.errorMessage =
        "Your account has been blocked. Please contact support.";
      return res.redirect("/user/login");
    }

    req.session.user = user;
    return res.redirect("/user/home");
  } catch (error) {
    console.error(error);
    return res.status(500).render("500", { message: "An unexpected error occurred during login." });
  }
}

const OFFER_TYPES = {
  FLAT: "flat",
  PERCENTAGE: "percentage",
};

const OFFER_FOR = {
  PRODUCT: "Product",
  CATEGORY: "Category",
};

async function getHome(req, res) {
  try {
    const user = req.session.user;
    const cartItemMap = await getCartItemMap(user ? user._id : null);

    // Fetch all products and categories
    const products = await Product.find({ isListed: true });
    const categories = await Category.find({ isListed: true });
    const ratingMap = await getAverageRatingsForProducts(products);

    // Fetch the best offer for each product
    const productsWithOffers = await Promise.all(
      products.map(async (product) => {
        const bestOffer = await getBestOffer(product);
        const averageRating = ratingMap[product._id.toString()] || 0;
        return { product, bestOffer, averageRating };
      })
    );

    // Fetch the top 4 best-selling products based on order frequency
    const bestSellingProducts = await aggregateProductFrequency();

    let bestSellingProductsWithOffers = [];

    if (bestSellingProducts.length > 0) {
      const bestSellingProductIds = bestSellingProducts
        .slice(0, 4)
        .map((item) => item._id);
      const bestSellingProductDetails = await Product.find({
        _id: { $in: bestSellingProductIds },
      });

      // Fetch best offers for the top-selling products
      const bestSellingRatingMap = await getAverageRatingsForProducts(bestSellingProductDetails);
      bestSellingProductsWithOffers = await Promise.all(
        bestSellingProductDetails.map(async (product) => {
          const bestOffer = await getBestOffer(product);
          const averageRating = bestSellingRatingMap[product._id.toString()] || 0;
          return { product, bestOffer, averageRating };
        })
      );

      // Sort the best-selling products by frequency count
      bestSellingProductsWithOffers = bestSellingProductsWithOffers
        .map(({ product, bestOffer, averageRating }) => {
          const count = bestSellingProducts.find(
            (f) => f._id.toString() === product._id.toString()
          ).count;
          return { product, bestOffer, count, averageRating };
        })
        .sort((a, b) => b.count - a.count);
    }
    const latestProductsWithOffers = await Product.find({ isListed: true })
      .sort({ createdAt: -1 })
      .collation({ locale: "en", strength: 2 })
      .limit(4);

    latestProductsWithOffers.sort((a, b) => a.name.localeCompare(b.name));

    // Fetch offers for the latest products
    const latestRatingMap = await getAverageRatingsForProducts(latestProductsWithOffers);
    const latestProductsWithOffersAndDetails = await Promise.all(
      latestProductsWithOffers.map(async (product) => {
        const bestOffer = await getBestOffer(product);
        const averageRating = latestRatingMap[product._id.toString()] || 0;
        return { product, bestOffer, averageRating };
      })
    );

    // Fallback to first 4 products if no best-selling products are available
    const fallbackBestSellingProducts = products.slice(0, 4);

    // Fetch best offers for the fallback products
    const fallbackRatingMap = await getAverageRatingsForProducts(fallbackBestSellingProducts);
    const fallbackProductsWithOffers = await Promise.all(
      fallbackBestSellingProducts.map(async (product) => {
        const bestOffer = await getBestOffer(product);
        const averageRating = fallbackRatingMap[product._id.toString()] || 0;
        return { product, bestOffer, averageRating };
      })
    );

    res.render("user/home", {
      user,
      productsWithOffers,
      cartItemMap,
      categories,
      bestSellingProducts: bestSellingProductsWithOffers.slice(0, 4),
      fallbackProducts: fallbackProductsWithOffers,
      latestProducts: latestProductsWithOffersAndDetails,
    });
  } catch (error) {
    console.error("Error fetching products or categories:", error);
    res.status(500).send("Error loading home page");
  }
}

const aggregateProductFrequency = async () => {
  const productFrequency = await Order.aggregate([
    {
      $match: {
        orderStatus: "Completed",
      },
    },
    { $unwind: "$items" },
    {
      $match: {
        "items.status": "Delivered",
      },
    },
    {
      $group: {
        _id: "$items.productId",
        count: { $sum: "$items.quantity" },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 4 },
  ]);

  return productFrequency;
};

async function getBestOffer(product) {
  const offers = await Offer.find({
    $or: [
      { targetId: product._id, offerFor: OFFER_FOR.PRODUCT, isActive: true },
      {
        targetId: product.category,
        offerFor: OFFER_FOR.CATEGORY,
        isActive: true,
      },
    ],
  });

  let bestOffer = null;
  let bestDiscountedPrice = product.price;

  offers.forEach((offer) => {
    // Check if offer is active and not expired
    const isExpired = offer.expiresAt && new Date(offer.expiresAt) <= new Date();
    if (offer.isActive && !isExpired) {
      const discountedPrice = calculateDiscountedPrice(offer, product);
      if (discountedPrice < bestDiscountedPrice) {
        bestDiscountedPrice = discountedPrice;
        bestOffer = offer.toObject ? offer.toObject() : { ...offer };
      }
    }
  });

  if (bestOffer) {
    bestOffer.discountedPrice = roundToTwo(bestDiscountedPrice);
  }

  return bestOffer;
}

function calculateDiscountedPrice(offer, product) {
  let discountedPrice = product.price;

  if (offer.offerFor === OFFER_FOR.PRODUCT) {
    if (offer.offerType === OFFER_TYPES.FLAT) {
      discountedPrice -= offer.value;
    } else if (offer.offerType === OFFER_TYPES.PERCENTAGE) {
      discountedPrice *= 1 - (offer.value / 100);
    }
    discountedPrice = roundToTwo(discountedPrice);
  } else if (offer.offerFor === OFFER_FOR.CATEGORY) {
    if (
      offer.offerType === OFFER_TYPES.FLAT &&
      product.price >= offer.minProductPrice
    ) {
      discountedPrice -= offer.value;
    } else if (offer.offerType === OFFER_TYPES.PERCENTAGE) {
      const potentialDiscount = product.price * (offer.value / 100);
      const maxDiscount = offer.maxDiscount;
      discountedPrice -= Math.min(potentialDiscount, maxDiscount);
    }
    discountedPrice = roundToTwo(discountedPrice);
  }

  // Ensure price doesn't go below zero and round to 2 decimals
  return roundToTwo(Math.max(discountedPrice, 0));
}

async function getShopPage(req, res) {
  try {
    const user = req.session.user || null;
    const cartItemMap = await getCartItemMap(user ? user._id : null);
    const { search, sort, category } = req.query;
    const query = { isListed: true };

    if (category && category !== "all") {
      const categoryDoc = await Category.findById(category);
      if (categoryDoc) {
        query.category = categoryDoc._id;
      }
    }

    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const page = parseInt(req.query.page) || 1;
    const limit = 8;
    const skip = (page - 1) * limit;

    let products = await Product.find(query).skip(skip).limit(limit);

    if (sort) {
      // Note: In-memory sort might be inefficient with pagination if query is large, 
      // but keeping it simple for now as per current structure. 
      // Ideally, sort should be part of the DB query.
      if (sort === "priceLowToHigh") {
        products.sort((a, b) => a.price - b.price);
      } else if (sort === "priceHighToLow") {
        products.sort((a, b) => b.price - a.price);
      } else if (sort === "aToZ") {
        products.sort((a, b) => a.name.localeCompare(b.name));
      } else if (sort === "zToA") {
        products.sort((a, b) => b.name.localeCompare(a.name));
      }
    }

    const totalProducts = await Product.countDocuments(query);
    const hasMore = totalProducts > skip + products.length;

    const ratingMap = await getAverageRatingsForProducts(products);
    const productsWithOffers = await Promise.all(
      products.map(async (product) => {
        const bestOffer = await getBestOffer(product);
        const averageRating = ratingMap[product._id.toString()] || 0;
        return { product, bestOffer, averageRating };
      })
    );

    const categories = await Category.find({ isListed: true });

    res.render("user/shop", {
      productsWithOffers,
      categories,
      search,
      sort,
      category,
      user,
      cartItemMap,
      currentPage: page,
      hasMore
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error loading shop page");
  }
}

async function getSingleProduct(req, res) {
  const { id } = req.params;
  try {
    const user = req.session.user;
    const cartItemMap = await getCartItemMap(user ? user._id : null);
    const product = await Product.findById(id).populate("category", "name");
    const categories = await Category.find({});

    if (!product) {
      return res.status(404).send("Product not found");
    }

    const categoryName = product.category
      ? product.category.name
      : "Uncategorized";

    // Fetch related products from the same category
    const limit = 4;
    const relatedProducts = await Product.find({
      category: product.category,
      _id: { $ne: product._id }, // Exclude the current product
      isListed: true
    }).limit(limit);

    const totalRelatedProducts = await Product.countDocuments({
      category: product.category,
      _id: { $ne: product._id },
      isListed: true
    });
    const hasMoreRelated = totalRelatedProducts > relatedProducts.length;

    // Get the best offer for the main product
    const bestOffer = await getBestOffer(product);

    // Get best offers and ratings for related products
    const relatedRatingMap = await getAverageRatingsForProducts(relatedProducts);
    const relatedProductsWithOffers = await Promise.all(
      relatedProducts.map(async (relatedProduct) => {
        const bestOffer = await getBestOffer(relatedProduct);
        const averageRating = relatedRatingMap[relatedProduct._id.toString()] || 0;
        return { product: relatedProduct, bestOffer, averageRating };
      })
    );

    // Calculate the discounted price for the main product if there's a best offer
    let discountedPrice = product.price;
    if (bestOffer) {
      discountedPrice = bestOffer.discountedPrice;
    }

    // Fetch active coupons for the product
    const currentDate = new Date();
    const activeCoupons = await Coupon.find({
      isActive: true,
      expiresAt: { $gte: currentDate },  // Only active coupons that have not expired
    });

    // Filter coupons
    const validCoupons = activeCoupons.filter(coupon => {
      // For percentage discounts, show regardless of price
      if (coupon.discountType === 'percentage') {
        return true;
      }
      // For flat discounts, check if product price meets the min order value
      if (coupon.discountType === 'flat' && product.price >= (coupon.minOrderValue || 0)) {
        return true;
      }
      return false;
    });

    // Calculate the effective discount for each valid coupon
    const couponsWithEffectiveDiscount = validCoupons.map(coupon => {
      let effectiveDiscount = 0;

      if (coupon.discountType === 'flat') {
        effectiveDiscount = coupon.discountAmount; // Flat discount
      } else if (coupon.discountType === 'percentage') {
        effectiveDiscount = (product.price * coupon.discountAmount) / 100; // Percentage discount based on product price
        // Ensure that the discount does not exceed the maxDiscount
        if (coupon.maxDiscount) {
          effectiveDiscount = Math.min(effectiveDiscount, coupon.maxDiscount);
        }
      }

      return { coupon, effectiveDiscount };
    });

    // Sort the coupons by the effective discount (in descending order)
    const sortedCoupons = couponsWithEffectiveDiscount.sort((a, b) => b.effectiveDiscount - a.effectiveDiscount);

    // Select top 2 best coupons
    const topCoupons = sortedCoupons.slice(0, 2).map(item => item.coupon);

    // Fetch initial reviews (top 5) - only those with non-empty comments
    const reviews = await Review.find({ 
      productId: id, 
      isListed: true,
      comment: { $exists: true, $ne: "" }
    })
      .populate("userId", "firstname lastname")
      .sort({ createdAt: -1 })
      .limit(5);

    const totalReviewsCount = await Review.countDocuments({ 
      productId: id, 
      isListed: true,
      comment: { $exists: true, $ne: "" }
    });
    const hasMoreReviews = totalReviewsCount > reviews.length;

    // Calculate average rating
    const ratingStats = await Review.aggregate([
      { $match: { productId: new mongoose.Types.ObjectId(id), isListed: true } },
      { $group: { _id: null, averageRating: { $avg: "$rating" } } }
    ]);
    const averageRating = ratingStats.length > 0 ? ratingStats[0].averageRating.toFixed(1) : 0;

    res.render("user/single-product", {
      user,
      cartItemMap,
      product,
      bestOffer,
      discountedPrice,
      categoryName,
      categories,
      relatedProductsWithOffers,
      activeCoupons: topCoupons,
      hasMoreRelated,
      currentPage: 1,
      reviews,
      totalReviewsCount,
      hasMoreReviews,
      averageRating
    });
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).send("Error loading product");
  }
}


async function getUserProfile(req, res) {
  try {
    const user = req.session.user;
    res.render("user/profile", { user });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    res.status(500).send("Error loading user profile");
  }
}

async function getAddresses(req, res) {
  const userId = req.session.user._id;
  const page = parseInt(req.query.page) || 1;
  const limit = 2;
  const skip = (page - 1) * limit;

  try {
    const totalAddresses = await Address.countDocuments({ userId });
    const totalPages = Math.ceil(totalAddresses / limit);
    const addresses = await Address.find({ userId }).skip(skip).limit(limit);
    const user = req.session.user;
    res.render("user/address", {
      addresses,
      user,
      currentPage: page,
      totalPages: totalPages || 1
    });
  } catch (error) {
    console.error("Error fetching addresses:", error);
    res.status(500).send("Error fetching addresses");
  }
}
async function updateUserProfile(req, res) {
  const { firstname, lastname } = req.body;
  const userId = req.session.user._id;

  try {
    await User.findByIdAndUpdate(userId, { firstname, lastname });

    req.session.user.firstname = firstname;
    req.session.user.lastname = lastname;

    res.status(200).json({ message: "Profile updated successfully" });
  } catch (error) {
    console.error("Error updating user profile:", error);
    res
      .status(500)
      .json({ message: "Error updating profile", error: error.message });
  }
}

async function updateEmail(req, res) {
  const { email } = req.body;
  const userId = req.session.user._id;

  try {
    await User.findByIdAndUpdate(userId, { email });
    req.session.user.email = email;
    res.status(200).json({ message: "Email updated successfully" });
  } catch (error) {
    console.error("Error updating email:", error);
    res
      .status(500)
      .json({ message: "Error updating email", error: error.message });
  }
}

async function updatePhoneNumber(req, res) {
  const { phone } = req.body;
  const userId = req.session.user._id;

  try {
    await User.findByIdAndUpdate(userId, { phoneNo: phone });
    req.session.user.phoneNo = phone;
    res.status(200).json({ message: "Phone number updated successfully" });
  } catch (error) {
    console.error("Error updating phone number:", error);
    res
      .status(500)
      .json({ message: "Error updating phone number", error: error.message });
  }
}

async function addAddress(req, res) {
  const {
    username,
    phoneNo,
    address,
    pincode,
    country,
    state,
    district,
    houseFlatNo,
    addressType,
  } = req.body;
  const userId = req.session.user._id;

  try {
    const newAddress = new Address({
      userId,
      username,
      phoneNo,
      address,
      pincode,
      country,
      state,
      district,
      houseFlatNo,
      addressType,
    });

    await newAddress.save();
    res.status(200).json({ message: "success" });
  } catch (error) {
    console.error("Error adding address:", error);
    req.flash("error", "Error adding address");
    res.redirect("/user/address/manage");
  }
}

async function editAddress(req, res) {
  const { id } = req.params;
  const {
    username,
    phoneNo,
    address,
    pincode,
    country,
    state,
    district,
    houseFlatNo,
    addressType,
  } = req.body;

  const updateData = {}; // Object to hold fields that need to be updated

  // Only add fields to updateData if they are provided in the request
  if (username) updateData.username = username;
  if (phoneNo) updateData.phoneNo = phoneNo;
  if (address) updateData.address = address;
  if (pincode) updateData.pincode = pincode;
  if (country) updateData.country = country;
  if (state) updateData.state = state;
  if (district) updateData.district = district;
  if (houseFlatNo) updateData.houseFlatNo = houseFlatNo;
  if (addressType) updateData.addressType = addressType;

  try {
    const updatedAddress = await Address.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    );

    if (!updatedAddress) {
      return res.status(404).json({ message: "Address not found" });
    }

    res.status(200).json({
      message: "Address updated successfully",
      address: updatedAddress,
    });
  } catch (error) {
    console.error("Error updating address:", error);
    res.status(500).json({ message: "Error updating address" });
  }
}

async function deleteAddress(req, res) {
  const { id } = req.params;

  try {
    const deletedAddress = await Address.findByIdAndDelete(id);
    if (!deletedAddress) {
      return res.status(404).json({ message: "Address not found" });
    }

    res.status(200).json({ message: "Address deleted successfully" });
  } catch (error) {
    console.error("Error deleting address:", error);
    res.status(500).json({ message: "Error deleting address" });
  }
}

async function changePassword(req, res) {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  const userId = req.session.user._id;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Check if the current password is correct
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ message: "Current password is incorrect." });
    }

    // Check if new password and confirm password match
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "New passwords do not match" });
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ message: "New password must be at least 6 characters long." });
    }

    // Hash new password and save
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.status(200).json({ message: "Password changed successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
}

async function getCart(req, res) {
  const userId = req.session.user._id;

  try {
    const cart = await Cart.findOne({ user: userId }).populate(
      "products.productId"
    );

    // Check if cart is found
    if (!cart) {
      return res.status(200).render("user/cart", {
        user: req.session.user,
        cart: null,
        subtotal: 0,
        deliveryCharge: 50,
        total: 50,
      });
    }

    // Calculate discounted prices and total
    let subtotal = 0;
    const updatedProducts = await Promise.all(
      cart.products.map(async (item) => {
        const bestOffer = await getBestOffer(item.productId);
        let price = item.productId.price;
        if (bestOffer) {
          price = bestOffer.discountedPrice;
        }
        subtotal += price * item.quantity;
        return {
          ...item.toObject(),
          discountedPrice: price,
        };
      })
    );

    const deliveryCharge = 50; // Fixed delivery charge
    const total = subtotal + deliveryCharge;

    res.status(200).render("user/cart", {
      user: req.session.user,
      cart: { ...cart.toObject(), products: updatedProducts },
      subtotal,
      deliveryCharge,
      total,
    });
  } catch (error) {
    console.error("Error fetching cart:", error);
    res.status(500).send("Error loading cart");
  }
}

async function addToCart(req, res) {
  const { user, productId, quantity } = req.body;

  if (!user) {
    return res.status(400).json({ message: "User ID is required" });
  }

  // Limit the maximum quantity of a single product to 10
  const MAX_QUANTITY = 10;

  // Check if the requested quantity exceeds the maximum limit
  if (quantity > MAX_QUANTITY) {
    return res.status(400).json({
      message: `Cannot add more than ${MAX_QUANTITY} of this product to the cart.`,
    });
  }

  try {
    // Find user's cart
    let cart = await Cart.findOne({ user });
    if (!cart) {
      cart = new Cart({ user, products: [] });
    }

    // Retrieve the product's stock
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Check if the product is listed
    if (!product.isListed) {
      return res.status(400).json({
        status: 'unlisted',
        message: "This product is no longer available"
      });
    }

    // Check if the product is out of stock
    if (product.stock === 0) {
      return res.status(400).json({
        status: 'out-of-stock',
        message: "Product out of stock"
      });
    }

    // Check if only 1 quantity is left and it's already in the cart
    const existingProductIndex = cart.products.findIndex(
      (item) => item.productId.toString() === productId
    );
    if (product.stock === 1 && existingProductIndex > -1) {
      return res.status(400).json({
        status: 'low-stock',
        message: "Only 1 product left and you have already added it to cart",
      });
    }

    // Check stock availability
    const totalQuantityInCart = cart.products.reduce((acc, item) => {
      if (item.productId.toString() === productId) {
        return acc + item.quantity; // Sum the quantities of this product in the cart
      }
      return acc;
    }, 0);

    // Check if adding the new quantity exceeds the stock
    if (totalQuantityInCart + quantity > product.stock) {
      return res.status(400).json({
        status: 'low-stock',
        message: `Only ${product.stock} of this product is available.`,
      });
    }

    if (existingProductIndex > -1) {
      // If the product already exists, update the quantity
      const newQuantity =
        cart.products[existingProductIndex].quantity + quantity;
      // Ensure the new quantity does not exceed the maximum limit
      if (newQuantity > MAX_QUANTITY) {
        return res.status(400).json({
          message: `Cannot exceed a quantity of ${MAX_QUANTITY} for this product.`,
        });
      }
      cart.products[existingProductIndex].quantity = newQuantity;

      // Update discountedPrice as well
      const bestOffer = await getBestOffer(product);
      cart.products[existingProductIndex].discountedPrice = bestOffer ? bestOffer.discountedPrice : product.price;
    } else {
      // If the product does not exist, add it to the cart
      const bestOffer = await getBestOffer(product);
      const discountedPrice = bestOffer ? bestOffer.discountedPrice : product.price;
      cart.products.push({ productId, quantity, discountedPrice });
    }

    await cart.save();
    return res.status(200).json({ message: "Item added to cart" });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Error adding item to cart", error });
  }
}

// Helper to calculate cart totals and individual item prices
async function calculateCartTotals(cart) {
  let subtotal = 0;
  const productsWithPrices = await Promise.all(
    cart.products.map(async (item) => {
      const bestOffer = await getBestOffer(item.productId);
      let price = item.productId.price;
      if (bestOffer) {
        price = bestOffer.discountedPrice;
      }
      subtotal += price * item.quantity;
      return {
        productId: item.productId._id.toString(),
        itemPrice: price,
        discountedPrice: price, // For consistency with updatedProducts in getCart
        totalItemPrice: price * item.quantity
      };
    })
  );

  const deliveryCharge = 50;
  const total = subtotal + deliveryCharge;

  return { subtotal, total, productsWithPrices };
}

async function removeFromCart(req, res) {
  const userId = req.session.user._id;
  const { productId } = req.body;

  try {
    const cart = await Cart.findOne({ user: userId }).populate("products.productId");
    if (cart) {
      cart.products = cart.products.filter(
        (item) => item.productId._id.toString() !== productId
      );
      await cart.save();

      const { subtotal, total } = await calculateCartTotals(cart);

      return res.status(200).json({
        message: "Item removed from cart successfully",
        subtotal,
        total,
        cartCount: cart.products.length
      });
    } else {
      return res.status(404).json({ message: "Cart not found" });
    }
  } catch (error) {
    console.error("Error removing item from cart:", error);
    return res.status(500).json({ message: "Error removing item from cart" });
  }
}

async function updateQuantity(req, res) {
  const userId = req.session.user._id;
  let { productId, quantity } = req.body;

  const MAX_QUANTITY = 10;
  quantity = parseInt(quantity);

  try {
    const cart = await Cart.findOne({ user: userId }).populate("products.productId");
    if (cart) {
      const productIndex = cart.products.findIndex(
        (item) => item.productId._id.toString() === productId
      );

      if (productIndex > -1) {
        const product = await Product.findById(productId);
        if (!product) {
          return res.status(404).json({ message: "Product not found" });
        }

        // Check if the product is listed
        if (!product.isListed) {
          return res.status(400).json({
            status: 'unlisted',
            message: "This product is no longer available"
          });
        }

        let message = null;
        const stockLimit = product.stock;
        const effectiveLimit = Math.min(MAX_QUANTITY, stockLimit);

        // Graceful clamping
        if (quantity < 1) {
          quantity = 1;
          message = "Minimum quantity is 1";
        } else if (quantity > effectiveLimit) {
          quantity = effectiveLimit;
          message = stockLimit < MAX_QUANTITY
            ? `Only ${stockLimit} items left in stock`
            : `Maximum ${MAX_QUANTITY} items allowed per product`;
        }

        cart.products[productIndex].quantity = quantity;

        // Update discountedPrice during quantity change to keep baseline current
        const bestOffer = await getBestOffer(product);
        cart.products[productIndex].discountedPrice = bestOffer ? bestOffer.discountedPrice : product.price;

        await cart.save();

        const { subtotal, total, productsWithPrices } = await calculateCartTotals(cart);
        const itemInfo = productsWithPrices.find(p => p.productId === productId);

        return res.status(200).json({
          message: message || "Quantity updated",
          newQuantity: quantity,
          subtotal,
          total,
          itemPrice: itemInfo ? itemInfo.itemPrice : product.price,
          totalItemPrice: itemInfo ? itemInfo.totalItemPrice : (product.price * quantity)
        });
      } else {
        return res.status(404).json({ message: "Product not found in cart" });
      }
    } else {
      return res.status(404).json({ message: "Cart not found" });
    }
  } catch (error) {
    console.error("Error updating quantity in cart:", error);
    return res.status(500).json({ message: "Error updating quantity in cart" });
  }
}

async function checkoutPage(req, res) {
  const userId = req.session.user?._id;
  if (!userId) {
    return res
      .status(401)
      .json({ message: "Unauthorized access. Please log in." });
  }

  try {
    const cart = await Cart.findOne({ user: userId }).populate(
      "products.productId"
    );
    const addresses = await Address.find({ userId });

    if (!cart || cart.products.length === 0) {
      // Redirect if cart is empty
      if (
        req.headers.accept &&
        req.headers.accept.includes("application/json")
      ) {
        return res
          .status(400)
          .json({ message: "Cart is empty. Please add products." });
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

        // Check for unlisted or totally out of stock
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
        // Check if requested quantity exceeds available stock
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

        // Detect if price changed since it was added to cart or last checkout visit
        const storedPrice = item.discountedPrice !== undefined ? item.discountedPrice : product.price;
        if (Math.abs(currentPrice - storedPrice) > 0.01) {
          priceChanged = true;
          // Update the stored price in the DB to match current for future loads
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

    // Persist the updated prices to the database if changes were detected
    // IMPORTANT: Only save if NOT an AJAX call, to ensure the notification appears on the final rendered page
    const isAjax = req.headers.accept && req.headers.accept.includes("application/json");
    if (priceChanged && !isAjax) {
      await cart.save();
    }

    // If any product is unavailable or insufficient, block checkout
    if (unavailableProducts.length > 0 || insufficientStockProducts.length > 0) {
      let errorMsg = "";
      if (unavailableProducts.length > 0) {
        errorMsg += `The following products are no longer available and must be removed: ${unavailableProducts.join(", ")}. `;
      }
      if (insufficientStockProducts.length > 0) {
        errorMsg += `Insufficient stock for: ${insufficientStockProducts.join(", ")}. Please adjust your cart.`;
      }

      if (req.headers.accept && req.headers.accept.includes("application/json")) {
        return res.status(400).json({
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
      message = "Some items in your cart have updated prices or offers. Please review your order summary before proceeding.";
    }

    if (req.headers.accept && req.headers.accept.includes("application/json")) {
      return res.status(200).json({ success: true });
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
    console.error("Error rendering checkout page:", error);
    return res.status(500).json({ message: "Error rendering checkout page." });
  }
}

async function applyCoupon(req, res) {
  const { couponCode, totalAmount } = req.body;

  const userId = req.session.user ? req.session.user._id : null;

  if (!userId) {
    return res.status(401).json({ message: "User not authenticated" });
  }

  const coupon = await Coupon.findOne({ code: couponCode, isActive: true });

  if (!coupon) {
    return res.status(400).json({ message: "Invalid or inactive coupon code" });
  }

  // Check if the coupon has expired
  if (new Date() > coupon.expiresAt) {
    return res.status(400).json({ message: "This coupon has expired" });
  }

  // Check if the user has already used the coupon
  const user = await User.findById(userId);
  if (user.usedCoupons.includes(couponCode)) {
    return res
      .status(400)
      .json({ message: "You have already used this coupon" });
  }

  // Check usage limits
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
    return res
      .status(400)
      .json({ message: "This coupon has reached its usage limit" });
  }

  // Check minimum order value
  if (coupon.minOrderValue && totalAmount < coupon.minOrderValue) {
    return res.status(400).json({
      message: `Minimum order value of ₹${coupon.minOrderValue} required for this coupon.`
    });
  }

  // Calculate discount
  let discountAmount =
    coupon.discountType === "flat"
      ? coupon.discountAmount
      : (coupon.discountAmount / 100) * totalAmount;

  discountAmount = roundToTwo(discountAmount);

  // Ensure discount does not exceed maxDiscount
  if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
    discountAmount = coupon.maxDiscount;
  }

  return res.status(200).json({ discount: roundToTwo(discountAmount) });
}

async function confirmOrder(req, res) {
  try {
    const {
      items,
      totalAmount,
      shippingAddress,
      paymentMethod,
      couponCode,
    } = req.body;

    // Cash on Delivery restriction
    if (paymentMethod === "CashOnDelivery" && totalAmount > 1000) {
      return res.status(400).json({
        message: "Cash on Delivery is not available for orders above ₹1000.",
      });
    }

    const userId = req.session.user ? req.session.user._id : null;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    // Check if cart is empty before proceeding
    const cart = await Cart.findOne({ user: userId });
    if (!cart || !cart.products || cart.products.length === 0) {
      return res.status(400).json({
        message: "Your cart is empty. The order might have already been processed.",
      });
    }

    // Validate input data
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Invalid or empty items array" });
    }
    if (!totalAmount || isNaN(totalAmount) || totalAmount <= 0) {
      return res.status(400).json({ message: "Invalid total amount" });
    }
    if (!shippingAddress) {
      return res.status(400).json({ message: "Shipping address is required" });
    }
    if (!paymentMethod) {
      return res.status(400).json({ message: "Payment method is required" });
    }

    // Check if products are still listed and have sufficient stock
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product || !product.isListed) {
        return res.status(400).json({
          message: `The product "${product ? product.name : 'Unknown'}" is no longer available. Please return to cart and remove it.`,
        });
      }
      if (product.stock < item.quantity) {
        return res.status(400).json({
          message: `Insufficient stock for "${product.name}". Only ${product.stock} items are left.`,
        });
      }
    }

    let recalculatedTotal = 0;
    let totalOfferDiscount = 0;

    for (const item of items) {
      const product = await Product.findById(item.productId);
      const bestOffer = await getBestOffer(product);
      const price =
        bestOffer
          ? bestOffer.discountedPrice
          : product.price;
      recalculatedTotal += price * item.quantity;

      if (bestOffer) {
        totalOfferDiscount +=
          (product.price - bestOffer.discountedPrice) * item.quantity;
      }
    }

    recalculatedTotal += 50;

    let discount = 0;
    if (couponCode) {
      const coupon = await Coupon.findOne({ code: couponCode, isActive: true });

      if (!coupon) {
        return res
          .status(400)
          .json({ message: "Invalid or inactive coupon code" });
      }

      if (new Date() > coupon.expiresAt) {
        return res.status(400).json({ message: "This coupon has expired" });
      }

      if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
        return res
          .status(400)
          .json({ message: "This coupon has reached its usage limit" });
      }

      // Re-verify coupon validity
      if (coupon.minOrderValue && recalculatedTotal < coupon.minOrderValue) {
        return res.status(400).json({
          message: `The order total (₹${recalculatedTotal}) is below the minimum required (₹${coupon.minOrderValue}) for coupon "${couponCode}".`
        });
      }

      // Calculate discount
      discount =
        coupon.discountType === "flat"
          ? coupon.discountAmount
          : (coupon.discountAmount / 100) * recalculatedTotal;
      
      discount = roundToTwo(discount);

      // Ensure discount does not exceed maxDiscount
      if (coupon.maxDiscount && discount > coupon.maxDiscount) {
        discount = coupon.maxDiscount;
      }
    }

    const finalTotalAmount = roundToTwo(recalculatedTotal - discount);

    if (Math.abs(finalTotalAmount - totalAmount) > 0.01) {
      return res.status(400).json({
        message:
          "The order total has changed. Please review your cart and try again.",
      });
    }

    // Wallet balance check before order creation
    if (paymentMethod === "Wallet") {
      const wallet = await Wallet.findOne({ userId });
      if (!wallet || wallet.balance < finalTotalAmount) {
        return res.status(400).json({
          message: "Insufficient wallet balance. Please choose another payment method or top up your wallet.",
        });
      }
    }

    const paymentStatus =
      paymentMethod === "Razorpay" || paymentMethod === "Wallet"
        ? "Failed"
        : "Pending";

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

    // Handle Wallet deduction immediately during order confirmation
    if (paymentMethod === "Wallet") {
      const wallet = await Wallet.findOne({ userId });
      // Balance was already checked above, but let's be safe
      if (wallet && wallet.balance >= finalTotalAmount) {
        wallet.balance = roundToTwo(wallet.balance - finalTotalAmount);

        const newTransaction = new Transaction({
          userId: userId,
          transactionId: await generateTransactionId(),
          amount: finalTotalAmount,
          type: "debit",
          description: `Payment for Order ${customOrderId}`,
          orderId: customOrderId,
        });

        await Promise.all([wallet.save(), newTransaction.save()]);
        newOrder.paymentStatus = "Successful";
      } else {
        return res.status(400).json({
          message: "Insufficient wallet balance.",
        });
      }
    }

    const savedOrder = await newOrder.save();

    // Update user's usedCoupons if applicable
    const user = await User.findById(userId);
    if (discount > 0 && couponCode) {
      user.usedCoupons.push(couponCode);
      await user.save();
    }

    if (couponCode) {
      await Coupon.findOneAndUpdate(
        { code: couponCode },
        { $inc: { usedCount: 1 } },
        { new: true }
      );
    }

    if (!savedOrder) {
      throw new Error("Failed to save the order");
    }

    // Handle stock reduction based on payment method
    if (paymentMethod === "CashOnDelivery" || paymentMethod === "Wallet") {
      for (const item of items) {
        const product = await Product.findById(item.productId);
        if (product) {
          product.stock -= item.quantity;
          await product.save();
        }
      }
    }

    // Clear the user's cart after successful order placement
    await Cart.findOneAndUpdate({ user: userId }, { $set: { products: [] } });

    return res.status(201).json({
      message: "Order placed successfully!",
      orderId: savedOrder._id,
    });
  } catch (error) {
    console.error("Error confirming order:", error);
    return res.status(500).json({
      message: "Error placing order. Please try again later.",
      error: error.message,
    });
  }
}

const razorpayInstance = new Razorpay({
  key_id: "rzp_test_KZK1gW6B1A7B5s",
  key_secret: "ttwYmmlesedbxjWK8AF59uJq",
});

async function createRazorpayOrder(req, res) {
  const { orderId } = req.body;

  // Fetch the order to get the total amount
  const order = await Order.findById(orderId);
  if (!order || order.paymentStatus !== "Failed") {
    return res
      .status(400)
      .json({ success: false, message: "Invalid order or payment status." });
  }

  // Create a Razorpay order
  const options = {
    amount: Math.round(order.totalAmount * 100), // Convert amount to paise and ensure it's an integer
    currency: "INR",
    receipt: `receipt_order_${orderId}`,
  };

  try {
    const razorpayOrder = await razorpayInstance.orders.create(options);
    res.json({
      success: true,
      id: razorpayOrder.id,
      amount: razorpayOrder.amount,
    });
  } catch (error) {
    console.error("Error creating Razorpay order:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to create Razorpay order." });
  }
}

async function confirmRazorpayPayment(req, res) {
  try {
    const { orderId, paymentResponse } = req.body;
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    order.paymentStatus = "Successful";
    await order.save();

    // Reduce stock for each item in the order
    for (const item of order.items) {
      const product = await Product.findById(item.productId);
      if (product) {
        product.stock -= item.quantity;
        await product.save();
      }
    }

    return res
      .status(200)
      .json({ message: "Payment confirmed and order processed successfully" });
  } catch (error) {
    console.error("Error confirming Razorpay payment:", error);
    return res
      .status(500)
      .json({ message: "Error processing payment", error: error.message });
  }
}

const getWalletBalance = async (req, res) => {
  try {
    const userId = req.session.user._id;
    let wallet = await Wallet.findOne({ userId });

    if (!wallet) {
      wallet = new Wallet({ userId, balance: 0 });
      await wallet.save();
    }

    return res.status(200).json({ balance: wallet.balance });
  } catch (error) {
    console.error("Error fetching wallet balance:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const deductWalletAmount = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { orderId, amount } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const wallet = await Wallet.findOne({ userId: user._id });
    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found" });
    }

    // Check if the wallet has sufficient balance
    if (wallet.balance < amount) {
      return res.status(400).json({ message: "Insufficient wallet balance" });
    }

    wallet.balance = roundToTwo(wallet.balance - amount);

    const customOrder = await Order.findById(orderId);
    if (!customOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Log the wallet transaction as a debit
    const newTransaction = new Transaction({
      userId: user._id,
      transactionId: await generateTransactionId(),
      amount: amount,
      type: "debit",
      orderId: customOrder.orderId,
      description: `Payment for Order ${customOrder.orderId}`,
    });

    await Promise.all([wallet.save(), newTransaction.save()]);

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    order.paymentStatus = "Successful";
    await order.save();

    // Reduce stock
    for (const item of order.items) {
      const product = await Product.findById(item.productId);

      if (product) {
        product.stock -= item.quantity;
        await product.save();
      }
    }

    return res.status(200).json({
      message: "Wallet payment successful",
      remainingBalance: wallet.balance,
    });
  } catch (error) {
    console.error("Error deducting wallet amount:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

async function getOrderSuccessPage(req, res) {
  const { orderId } = req.query;

  try {
    const order = await Order.findById(orderId).populate("items.productId");

    if (!order) {
      return res.status(404).send("Order not found");
    }

    res.render("user/orderSuccess", { order });
  } catch (error) {
    console.error("Error fetching order details:", error);
    res.status(500).send("Internal Server Error");
  }
}

async function getUserOrders(req, res) {
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
  } else if (["Pending", "Shipped", "Completed", "Cancelled"].includes(sort)) {
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
    console.error("Error fetching user orders:", error);
    res.status(500).send("Server Error: " + error.message);
  }
}

async function getForgotPassword(req, res) {
  if (req.session.user) {
    return res.redirect("/user/home");
  }
  res.render("user/forgot-password");
}

async function getOrderDetails(req, res) {
  try {
    const userId = req.session.user._id;
    const orderId = req.params.id;

    const order = await Order.findOne({ _id: orderId, userId }).populate({
      path: "items.productId",
      populate: { path: "category" },
    });

    if (!order) {
      return res.status(404).send("Order not found");
    }

    // Calculate return window for each item in the backend
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
    console.error("Error fetching order details:", error);
    res.status(500).send("Server Error: " + error.message);
  }
}

async function downloadInvoice(req, res) {
  const userId = req.session.user._id;
  const orderId = req.params.id;

  try {
    const order = await Order.findOne({ _id: orderId, userId }).populate(
      "items.productId"
    );

    if (!order) {
      return res.status(404).send("Order not found");
    }

    // Create a PDF document
    const doc = new PDFDocument();
    let filename = `Invoice_${orderId}.pdf`;
    res.setHeader(
      "Content-disposition",
      'attachment; filename="' + filename + '"'
    );
    res.setHeader("Content-type", "application/pdf");

    doc.pipe(res);

    doc.fontSize(27).text("Subtlety", { align: "center" });
    doc.fontSize(12).text("Sold by: Nandalal M", { align: "center" });
    doc.fontSize(12).text("Address: Ft44, Main Street, City Central, Delhi", {
      align: "center",
    });
    doc.moveDown(2);

    doc.fontSize(16).text("Billing Address:", { underline: true });
    doc.moveDown();

    doc.fontSize(12).text(`Name: ${order.shippingAddress.fullname}`);
    doc.fontSize(12).text(`Address: ${order.shippingAddress.address}`);
    doc.fontSize(12).text(`Pincode: ${order.shippingAddress.pincode}`);
    doc.fontSize(12).text(`Phone No: ${order.shippingAddress.phone || "N/A"}`);
    doc.moveDown();

    // Order summary
    doc.fontSize(16).text("Order Summary", { underline: true });
    doc.moveDown();

    doc.fontSize(12).text(`Order ID: ${order._id}`);
    doc
      .fontSize(12)
      .text(`Order Date: ${new Date(order.orderDate).toLocaleDateString()}`);
    doc.fontSize(12).text(`Payment Method: ${order.paymentMethod}`);
    doc.moveDown(2);

    // Order summary headers (bold)
    doc.fontSize(12).font("Helvetica-Bold");
    const headerY = doc.y;
    doc.text("Product Name", 73, headerY, { width: 110 });
    doc.text("Product Status", 215, headerY);
    doc.text("Unit Price", 320, headerY);
    doc.text("Quantity", 390, headerY);
    doc.text("Total Price", 470, headerY);

    doc.fontSize(12).font("Helvetica");

    let y = headerY + 20;
    let totalPaid = 0;

    // Loop through the order items and add them to the table
    order.items.forEach((item) => {
      const totalPrice = item.price * item.quantity;
      const isDelivered =
        item.status && item.status.trim().toLowerCase() === "delivered";

      doc.fontSize(12).text(`${item.productId.name}`, 73, y, { width: 110 });
      doc.fontSize(12).text(`${item.status || "N/A"}`, 215, y);
      doc.fontSize(12).text(`${item.price.toFixed(2)}`, 320, y);
      doc.fontSize(12).text(`x ${item.quantity}`, 390, y);
      doc
        .fontSize(12)
        .text(`${isDelivered ? totalPrice.toFixed(2) : "0.00"}`, 470, y);

      // Add to totalPaid only if delivered
      if (isDelivered) {
        totalPaid += totalPrice;
      }

      y += 20;
    });

    doc.moveDown(3);
    doc.font("Helvetica-Bold");
    const totalAmountText = `Total Amount Paid: ${totalPaid.toFixed(2)}`;
    doc.fontSize(14).text(totalAmountText, 73);

    doc.font("Helvetica");

    doc.end();
  } catch (error) {
    console.error("Error generating invoice:", error);
    res.status(500).send("Server Error: " + error.message);
  }
}

async function cancelProduct(req, res) {
  const userId = req.session.user._id;
  const orderId = req.params.id;
  const productId = req.params.productId;

  try {
    const order = await Order.findOne({ _id: orderId, userId });

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const itemIndex = order.items.findIndex(
      (item) => item.productId.toString() === productId
    );
    if (itemIndex === -1) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found in order" });
    }

    const item = order.items[itemIndex];
    if (["Shipped", "Delivered", "Cancelled", "Returned"].includes(item.status)) {
      return res.status(400).json({
        success: false,
        message: `Product cannot be cancelled as it is already ${item.status.toLowerCase()}`,
      });
    }

    item.status = "Cancelled";

    // Revert stock for the specific item
    const product = await Product.findById(item.productId);
    if (product) {
      product.stock += item.quantity;
      await product.save();
    }

    // If payment method is Razorpay, add the price back to wallet
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
          description: `Refund for cancellation of order ${order.orderId}`,
        });

        await Promise.all([wallet.save(), newTransaction.save()]);
      }
    }

    const allCancelled = order.items.every((item) => item.status === "Cancelled");

    // Update order status based on the product statuses
    if (allCancelled) {
      order.orderStatus = "Cancelled";
    }
    await order.save();

    return res.json({
      success: true,
      message: "Product cancelled successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
}

async function returnProduct(req, res) {
  const userId = req.session.user._id;
  const orderId = req.params.id;
  const productId = req.params.productId;
  const { reason } = req.body;

  try {
    const order = await Order.findOne({ _id: orderId, userId });

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const itemIndex = order.items.findIndex(
      (item) => item.productId.toString() === productId
    );
    if (itemIndex === -1) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found in order" });
    }

    // 7-day return window validation
    const deliveryDate = order.items[itemIndex].status === 'Delivered' ? (order.updatedAt || order.orderDate) : null;
    if (deliveryDate && (new Date() - new Date(deliveryDate) > 7 * 24 * 60 * 60 * 1000)) {
      return res.status(400).json({ 
        success: false, 
        message: "The return window for this product has closed (7 days from delivery)." 
      });
    }

    // Coupon applied validation
    if (order.couponDiscount > 0) {
      return res.status(400).json({
        success: false,
        message: "Returns are not allowed for orders where a coupon was applied."
      });
    }

    // Create a return request instead of updating status
    const returnRequest = {
      productId: order.items[itemIndex].productId,
      reason: reason,
      requestedAt: new Date(),
      status: "Pending",
    };

    if (!order.returnRequests) {
      order.returnRequests = []; // Initialize returnRequests array if it doesn't exist
    }

    order.returnRequests.push(returnRequest);

    await order.save();

    return res.json({
      success: true,
      message: "Return request submitted successfully. Please wait for admin approval.",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
}

async function getWallet(req, res) {
  const userId = req.session.user._id;
  const user = await User.findById(userId);
  const page = parseInt(req.query.page) || 1;
  const limit = 5;
  const skip = (page - 1) * limit;
  const { search, sort } = req.query;

  try {
    let walletDoc = await Wallet.findOne({ userId });

    if (!walletDoc) {
      walletDoc = new Wallet({ userId });
      await walletDoc.save();
    }

    // Prepare search filter
    const query = { userId: new mongoose.Types.ObjectId(userId) };
    if (search) {
      query.transactionId = { $regex: search.trim(), $options: "i" };
    }
    if (sort === "credit" || sort === "debit") {
      query.type = sort;
    }

    // Sort options
    const sortOption = { date: sort === "oldest" ? 1 : -1 };

    // Fetch total count and paginated data using Transactions collection
    const [transactions, totalTransactions, totalTransactionsUnfiltered] = await Promise.all([
      Transaction.find(query).sort(sortOption).skip(skip).limit(limit).lean(),
      Transaction.countDocuments(query),
      Transaction.countDocuments({ userId: new mongoose.Types.ObjectId(userId) })
    ]);

    const totalPages = Math.max(1, Math.ceil(totalTransactions / limit));

    res.render("user/userWallet", {
      wallet: walletDoc,
      transactions,
      user,
      referralBaseUrl: process.env.CLIENT_URL_FOR_REFFERAL,
      currentPage: page,
      totalPages,
      totalTransactions,
      totalTransactionsUnfiltered,
      limit,
      search: search || "",
      sort: sort || "latest"
    });
  } catch (error) {
    console.error("Error fetching wallet:", error);
    res.status(500).send("Server Error: " + error.message);
  }
}

async function sendOtpForPasswordReset(req, res) {
  const { email } = req.body;

  try {
    const existingUser = await User.findOne({ email });
    if (!existingUser) {
      return res.status(400).send("Email not registered");
    }

    const otp = String(crypto.randomInt(100000, 999999));
    const otpTimestamp = Date.now();

    req.session.passwordResetUser = { email, otp, otpTimestamp };

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    const mailOptions = {
      from: `"Subtlety Support" <${process.env.EMAIL}>`,
      to: email,
      subject: "Password Reset OTP",
      html: `
        <div style="font-family: 'Poppins', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <img src="cid:logo" alt="Subtlety Logo" style="width: 150px;">
          </div>
          <h2 style="color: #9135ED; text-align: center;">Password Reset</h2>
          <p style="font-size: 16px; color: #333; line-height: 1.5;">
            Hello, <br><br>
            We received a request to reset your password for your <strong>Subtlety</strong> account. Use the following One-Time Password (OTP) to proceed:
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <span style="font-size: 32px; font-weight: bold; color: #9135ED; letter-spacing: 5px; border: 2px dashed #9135ED; padding: 10px 20px; border-radius: 5px;">${otp}</span>
          </div>
          <p style="font-size: 14px; color: #666; text-align: center;">
            This OTP is valid for <strong>60 seconds</strong>. If you did not request a password reset, please ignore this email.
          </p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="font-size: 12px; color: #999; text-align: center;">
            &copy; ${new Date().getFullYear()} Subtlety. All rights reserved.
          </p>
        </div>
      `,
      attachments: [{
        filename: 'logo.png',
        path: path.join(__dirname, '../public/images/logo-bg-removed.png'),
        cid: 'logo'
      }]
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({
      message: "OTP sent to your email for password reset. Please verify.",
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error sending OTP");
  }
}

async function verifyOtpForPasswordReset(req, res) {
  const { email, otp } = req.body;

  try {
    const resetUser = req.session.passwordResetUser;

    if (
      !resetUser ||
      resetUser.email !== email ||
      String(resetUser.otp) !== String(otp)
    ) {
      return res.status(400).send("Invalid OTP or user data not found");
    }

    const otpValidityDuration = 60 * 1000;
    if (Date.now() - resetUser.otpTimestamp > otpValidityDuration) {
      return res.status(400).send("OTP has expired. Please request a new one.");
    }

    res.status(200).json({
      message: "OTP verified successfully. You can now change your password.",
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error verifying OTP");
  }
}

async function resetPassword(req, res) {
  const { email, newPassword } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update the user's password
    await User.updateOne({ email }, { password: hashedPassword });

    // Clear the password reset session data
    req.session.passwordResetUser = null;

    res.status(200).json({ message: "Password changed successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error changing password");
  }
}

// Resend OTP
async function resendPasswordResetOtp(req, res) {
  const { email } = req.body;

  try {
    const resetUser = req.session.passwordResetUser;

    if (!resetUser || resetUser.email !== email) {
      return res
        .status(400)
        .send("User not found in session. Please request a new OTP.");
    }

    const otp = String(crypto.randomInt(100000, 999999));
    const otpTimestamp = Date.now();

    // Update the OTP and timestamp in the session
    resetUser.otp = otp;
    resetUser.otpTimestamp = otpTimestamp;

    await sendOtpEmail(email, otp); // Send the new OTP to the user's email

    res.status(200).json({ message: "New OTP sent to your email." });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error resending OTP");
  }
}

async function getWishlist(req, res) {
  try {
    const userId = req.session.user._id;
    const cartItemMap = await getCartItemMap(userId);
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const skip = (page - 1) * limit;

    // First, find the user to get all wishlisted product IDs that are listed
    const userDoc = await User.findById(userId);
    if (!userDoc) {
      return res.status(404).send("User not found");
    }

    // Get the total count of listed products in wishlist
    const totalWishlisted = await Product.countDocuments({
      _id: { $in: userDoc.wishlisted },
      isListed: true
    });
    const totalPages = Math.ceil(totalWishlisted / limit);

    // Now populate with pagination
    const user = await User.findById(userId).populate({
      path: "wishlisted",
      match: { isListed: true },
      options: { skip, limit }
    });

    const categories = await Category.find({});

    const ratingMap = await getAverageRatingsForProducts(user.wishlisted);
    const productsWithOffers = await Promise.all(
      user.wishlisted.map(async (product) => {
        const bestOffer = await getBestOffer(product);
        const averageRating = ratingMap[product._id.toString()] || 0;
        return { product, bestOffer, averageRating };
      })
    );

    res.render("user/wishlist", {
      products: productsWithOffers,
      user,
      cartItemMap,
      categories,
      currentPage: page,
      totalPages: totalPages || 1
    });
  } catch (error) {
    console.error("Error fetching wishlist:", error);
    res.status(500).send("Server error");
  }
}

async function addToWishlist(req, res) {
  const { userId, productId } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Check if product is already in the wishlist
    if (user.wishlisted.includes(productId)) {
      return res
        .status(400)
        .json({ message: "Product is already in your wishlist." });
    }

    // Add the product to the wishlist
    user.wishlisted.push(productId);
    await user.save();

    res.status(200).json({ message: "Product added to wishlist." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error adding product to wishlist." });
  }
}

async function deleteFromWishlist(req, res) {
  const { userId } = req.body;
  const { productId } = req.params;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Check if the product is in the wishlist
    const productIndex = user.wishlisted.indexOf(productId);
    if (productIndex === -1) {
      return res
        .status(400)
        .json({ message: "Product not found in wishlist." });
    }

    // Remove the product from the wishlist
    user.wishlisted.splice(productIndex, 1);
    await user.save();

    res.status(200).json({ message: "Product removed from wishlist." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error removing product from wishlist." });
  }
}

async function logout(req, res) {
  if (req.session.user) {
    delete req.session.user;
  }

  res.redirect("/user/login");
}

async function loadMoreRelatedProducts(req, res) {
  try {
    const user = req.session.user || null;
    const cartItemMap = await getCartItemMap(user ? user._id : null);
    const { productId, categoryId } = req.query;
    const page = parseInt(req.query.page) || 2;
    const limit = 4;
    const skip = (page - 1) * limit;

    const query = {
      category: categoryId,
      _id: { $ne: productId },
      isListed: true
    };

    const relatedProducts = await Product.find(query).skip(skip).limit(limit);

    const relatedRatingMap = await getAverageRatingsForProducts(relatedProducts);
    const relatedProductsWithOffers = await Promise.all(
      relatedProducts.map(async (relatedProduct) => {
        const bestOffer = await getBestOffer(relatedProduct);
        const averageRating = relatedRatingMap[relatedProduct._id.toString()] || 0;
        return { product: relatedProduct, bestOffer, averageRating };
      })
    );

    const totalRelatedProducts = await Product.countDocuments(query);
    const hasMore = totalRelatedProducts > skip + relatedProducts.length;

    res.json({ products: relatedProductsWithOffers, cartItemMap, hasMore });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error loading more related products" });
  }
}

async function loadMoreProducts(req, res) {
  try {
    const user = req.session.user || null;
    const cartItemMap = await getCartItemMap(user ? user._id : null);
    const { search, sort, category } = req.query;
    const page = parseInt(req.query.page) || 2;
    const limit = 8;
    const skip = (page - 1) * limit;

    const query = { isListed: true };
    if (category && category !== "all") {
      const categoryDoc = await Category.findById(category);
      if (categoryDoc) query.category = categoryDoc._id;
    }
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    let products = await Product.find(query).skip(skip).limit(limit);

    if (sort) {
      if (sort === "priceLowToHigh") products.sort((a, b) => a.price - b.price);
      else if (sort === "priceHighToLow") products.sort((a, b) => b.price - a.price);
      else if (sort === "aToZ") products.sort((a, b) => a.name.localeCompare(b.name));
      else if (sort === "zToA") products.sort((a, b) => b.name.localeCompare(a.name));
    }

    const ratingMap = await getAverageRatingsForProducts(products);
    const productsWithOffers = await Promise.all(
      products.map(async (product) => {
        const bestOffer = await getBestOffer(product);
        const averageRating = ratingMap[product._id.toString()] || 0;
        return { product, bestOffer, averageRating };
      })
    );

    const totalProducts = await Product.countDocuments(query);
    const hasMore = totalProducts > skip + products.length;

    res.json({ products: productsWithOffers, cartItemMap, hasMore });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error loading more products" });
  }
}

async function postReview(req, res) {
  const { productId, orderId, rating, comment } = req.body;
  const user = req.session.user;

  if (!user) {
    return res.status(401).json({ success: false, message: "Please log in to review." });
  }

  try {
    // Check if the product was delivered in this order
    const order = await Order.findOne({
      _id: orderId,
      userId: user._id,
      "items": {
        $elemMatch: {
          productId: productId,
          status: "Delivered"
        }
      }
    });

    if (!order) {
      return res.status(400).json({
        success: false,
        message: "You can only review items that have been delivered."
      });
    }

    // Check if item was returned or has a pending return
    const returnRequest = order.returnRequests.find(
      (req) => req.productId.toString() === productId
    );
    if (returnRequest && returnRequest.status !== "Rejected") {
      return res.status(400).json({
        success: false,
        message: returnRequest.status === "Pending"
          ? "You cannot review a product while a return request is pending."
          : "Returned items cannot be reviewed."
      });
    }

    const review = new Review({
      productId,
      userId: user._id,
      orderId,
      rating: Number(rating),
      comment
    });

    await review.save();

    // Mark the item as rated so the Rate & Review button disappears
    const orderItem = order.items.find(
      (i) => i.productId.toString() === productId
    );
    if (orderItem) {
      orderItem.isRated = true;
      await order.save();
    }

    res.json({ success: true, message: "Review submitted successfully!" });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "You have already reviewed this product for this order."
      });
    }
    console.error("Review Error:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
}

async function loadMoreReviews(req, res) {
  const { productId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = 5;
  const skip = (page - 1) * limit;

  try {
    const reviews = await Review.find({ 
      productId, 
      isListed: true,
      comment: { $exists: true, $ne: "" }
    })
      .populate("userId", "firstname lastname")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Review.countDocuments({ 
      productId, 
      isListed: true,
      comment: { $exists: true, $ne: "" }
    });
    const hasMore = total > skip + reviews.length;

    res.json({
      success: true,
      reviews: reviews.map(r => ({
        user: `${r.userId.firstname} ${r.userId.lastname || ""}`,
        rating: r.rating,
        comment: r.comment,
        date: r.createdAt.toLocaleDateString("en-GB")
      })),
      hasMore
    });
  } catch (error) {
    console.error("Load More Reviews Error:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
}

async function getAverageRatingsForProducts(products) {
  if (!products || products.length === 0) return {};
  const productIds = products.map(p => new mongoose.Types.ObjectId(p._id || p.productId?._id || p));
  const ratings = await Review.aggregate([
    { $match: { productId: { $in: productIds }, isListed: true } },
    { $group: { _id: "$productId", averageRating: { $avg: "$rating" } } }
  ]);

  return ratings.reduce((map, r) => {
    map[r._id.toString()] = r.averageRating.toFixed(1);
    return map;
  }, {});
}

module.exports = {
  getLogin,
  getSignup,
  addUser,
  verifyOtp,
  resendOtp,
  loginUser,
  getHome,
  getSingleProduct,
  loadMoreRelatedProducts,
  getUserProfile,
  updateUserProfile,
  updateEmail,
  updatePhoneNumber,
  changePassword,
  getAddresses,
  addAddress,
  editAddress,
  deleteAddress,
  getCart,
  addToCart,
  removeFromCart,
  updateQuantity,
  checkoutPage,
  applyCoupon,
  confirmOrder,
  createRazorpayOrder,
  confirmRazorpayPayment,
  getWalletBalance,
  deductWalletAmount,
  getUserOrders,
  getOrderDetails,
  downloadInvoice,
  cancelProduct,
  returnProduct,
  getShopPage,
  getOrderSuccessPage,
  getWallet,
  getForgotPassword,
  verifyOtpForPasswordReset,
  sendOtpForPasswordReset,
  resetPassword,
  resendPasswordResetOtp,
  getWishlist,
  addToWishlist,
  deleteFromWishlist,
  logout,
  loadMoreProducts,
  postReview,
  loadMoreReviews,
  generateOrderId,
  generateTransactionId,
};
