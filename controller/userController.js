const User = require("../model/user");
const bcrypt = require("bcryptjs");
const Product = require("../model/product");
const Category = require("../model/category");
const Cart = require("../model/cart");
const Address = require("../model/userAddress");
const Order = require("../model/order");
const Coupon = require("../model/coupon");
const nodemailer = require("nodemailer");
const Razorpay = require("razorpay");
const crypto = require("crypto"); // For generating random OTP
const Wallet = require("../model/wallet");
const Offer = require("../model/offer"); // Adjust the path as needed
const PDFDocument = require("pdfkit");

function getLogin(req, res) {
  if (req.session.user) {
    return res.redirect("/user/home");
  }
  const errorMessage = req.session.errorMessage || null; // Get error message from session
  req.session.errorMessage = null; // Clear the message after reading
  res.render("user/login", { errorMessage });
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
    from: process.env.EMAIL,
    to: email,
    subject: "Your OTP Code",
    text: `Welcome to Subtlety, Your OTP is ${otp}. Valid For 60sec`,
  };

  await transporter.sendMail(mailOptions);
}

// Add user and send OTP
async function addUser(req, res) {
  const { firstname, lastname, email, password, referral } = req.body;

  try {
    // Check if the user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).send("User already exists");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = String(crypto.randomInt(100000, 999999)); // Generate a 6-digit OTP
    const otpTimestamp = Date.now(); // Get the current timestamp

    // Store user data temporarily in the session
    req.session.tempUser = {
      firstname,
      lastname,
      email,
      password: hashedPassword,
      otp,
      otpTimestamp, // Store the timestamp
    };

    // Store referral user ID (if any) in the session
    if (referral) {
      req.session.referralUserId = referral; // Store the referring user's ID
    }

    // Send OTP to email
    await sendOtpEmail(email, otp);

    // Respond with a message
    res.status(200).json({ message: "OTP sent to your email. Please verify." });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error registering user");
  }
}

// Verify OTP
async function verifyOtp(req, res) {
  const { email, otp, referral } = req.body; // Destructure referral from the request body

  try {
    // Check if user data is in the session
    const tempUser = req.session.tempUser;

    if (
      !tempUser ||
      tempUser.email !== email ||
      String(tempUser.otp) !== String(otp)
    ) {
      return res.status(400).send("Invalid OTP or user data not found");
    }

    // Check if the OTP has expired (valid for 60 seconds)
    const otpValidityDuration = 60 * 1000; // 60 seconds
    if (Date.now() - tempUser.otpTimestamp > otpValidityDuration) {
      return res.status(400).send("OTP has expired. Please request a new one.");
    }

    // Create a new user instance and save to the database
    const newUser = new User({
      firstname: tempUser.firstname,
      lastname: tempUser.lastname,
      email: tempUser.email,
      password: tempUser.password,
      isVerified: true, // Mark as verified
    });

    await newUser.save(); // Save the user to the database

    // Clear the tempUser from the session
    req.session.tempUser = null;

    // Check if there's a referral ID sent from the frontend
    if (referral) {
      const referralUser = await User.findById(referral); // Get the referral user by ID

      // Check if the referral user exists and hasn't already been credited
      if (referralUser && !referralUser.referralCreditsClaimed) {
        // Credit the referring user with 600 rupees to their wallet
        const wallet = await Wallet.findOne({ userId: referralUser });

        if (wallet) {
          // If the wallet exists, add 600 rupees to the balance
          wallet.balance += 600;
          wallet.transactions.push({
            amount: 600,
            type: "credit",
            description: "Referral bonus credited for referring a new user",
          });
          await wallet.save(); // Save the updated wallet
        } else {
          // If the wallet does not exist, create a new one for the referral user
          const newWallet = new Wallet({
            userId: referralUser._id, // Set the referral user's ID
            balance: 600, // Initial balance credited with 600
            transactions: [
              {
                amount: 600,
                type: "credit",
                description: "Referral bonus credited for referring a new user",
              },
            ],
          });
          await newWallet.save(); // Save the newly created wallet
        }

        // Mark the referral user as credited
        referralUser.referralCreditsClaimed = true; // Mark as credited
        await referralUser.save(); // Save the changes to the referral user
      }
    }

    // Log the user in
    req.session.user = newUser; // Store user info in session
    res.status(200).redirect("/user/home"); // Redirect to home page
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

    const otp = String(crypto.randomInt(100000, 999999)); // Generate a new OTP
    const otpTimestamp = Date.now(); // Get the current timestamp

    // Update the OTP and timestamp in the session
    tempUser.otp = otp;
    tempUser.otpTimestamp = otpTimestamp;

    await sendOtpEmail(email, otp); // Send the new OTP to the user's email

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
    if (!user || !(await bcrypt.compare(password, user.password))) {
      req.session.errorMessage = "Invalid email or password"; // Set flash message
      return res.redirect("/user/login"); // Redirect back to login
    }

    if (user.isBlocked) {
      req.session.errorMessage =
        "Your account has been blocked. Please contact support.";
      return res.redirect("/user/login"); // Redirect back to login
    }

    req.session.user = user; // Store user info in session
    return res.redirect("/user/home"); // Redirect to home page
  } catch (error) {
    console.error(error);
    return res.status(500).send("Error logging in");
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
    // Fetch all products and categories
    const products = await Product.find({ isListed: true });
    const categories = await Category.find({});
    const user = req.session.user;

    // Fetch the best offer for each product
    const productsWithOffers = await Promise.all(
      products.map(async (product) => {
        const bestOffer = await getBestOffer(product);
        return { product, bestOffer };
      })
    );

    // Fetch the top 4 best-selling products based on order frequency, but only consider delivered products
    const bestSellingProducts = await aggregateProductFrequency();

    let bestSellingProductsWithOffers = [];

    if (bestSellingProducts.length > 0) {
      // If we have best-selling products, get their details
      const bestSellingProductIds = bestSellingProducts
        .slice(0, 4) // Only take the top 4 best-selling products
        .map((item) => item._id);
      const bestSellingProductDetails = await Product.find({
        _id: { $in: bestSellingProductIds },
      });

      // Fetch best offers for the top-selling products
      bestSellingProductsWithOffers = await Promise.all(
        bestSellingProductDetails.map(async (product) => {
          const bestOffer = await getBestOffer(product);
          return { product, bestOffer };
        })
      );

      // Sort the best-selling products by frequency count
      bestSellingProductsWithOffers = bestSellingProductsWithOffers
        .map(({ product, bestOffer }) => {
          const count = bestSellingProducts.find(
            (f) => f._id.toString() === product._id.toString()
          ).count;
          return { product, bestOffer, count };
        })
        .sort((a, b) => b.count - a.count); // Sort by frequency (descending)
    }
    // Fetch the latest 4 products sorted by creation date first, then alphabetically
    const latestProductsWithOffers = await Product.find({})
      .sort({ createdAt: -1 }) // Sort by creation date descending first
      .collation({ locale: "en", strength: 2 }) // Ensure case-insensitive sorting
      .limit(4); // Limit to 4 products

    // Sort them alphabetically (A-Z) within the same createdAt order
    latestProductsWithOffers.sort((a, b) => a.name.localeCompare(b.name));

    // Fetch offers for the latest products
    const latestProductsWithOffersAndDetails = await Promise.all(
      latestProductsWithOffers.map(async (product) => {
        const bestOffer = await getBestOffer(product);
        return { product, bestOffer };
      })
    );

   // Fallback to first 4 products if no best-selling products are available
   const fallbackBestSellingProducts = products.slice(0, 4);

   // Fetch best offers for the fallback products
   const fallbackProductsWithOffers = await Promise.all(
     fallbackBestSellingProducts.map(async (product) => {
       const bestOffer = await getBestOffer(product);
       return { product, bestOffer };
     })
   );

    // Send the response with both latest products and best-selling products (only 4 each)
    res.render("user/home", {
      user,
      productsWithOffers,
      categories,
      bestSellingProducts: bestSellingProductsWithOffers.slice(0, 4),
      fallbackProducts: fallbackProductsWithOffers, // Send fallback products separately
      latestProducts: latestProductsWithOffersAndDetails, // Latest products (4)
    });
  } catch (error) {
    console.error("Error fetching products or categories:", error);
    res.status(500).send("Error loading home page");
  }
}

// Aggregating the product frequency across all orders
const aggregateProductFrequency = async () => {
  const productFrequency = await Order.aggregate([
    { $unwind: "$items" }, // Unwind the order items to separate each productId
    {
      $match: {
        "items.status": "Delivered", // Only consider products that are delivered
      },
    },
    {
      $group: {
        _id: "$items.productId", // Group by productId
        count: { $sum: 1 }, // Count the number of times this product appears
      },
    },
    { $sort: { count: -1 } }, // Sort by the count in descending order
    { $limit: 6 }, // Limit to the top 6 most frequent products
  ]);

  return productFrequency;
};


// Your existing getBestOffer function
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
    if (offer.expiresAt && new Date(offer.expiresAt) > new Date()) {
      const discountedPrice = calculateDiscountedPrice(offer, product);
      if (discountedPrice < bestDiscountedPrice) {
        bestDiscountedPrice = discountedPrice;
        bestOffer = offer;
      }
    }
  });

  if (bestOffer) {
    bestOffer.discountedPrice = bestDiscountedPrice;
  }

  return bestOffer;
}

function calculateDiscountedPrice(offer, product) {
  let discountedPrice = product.price;

  if (offer.offerFor === OFFER_FOR.PRODUCT) {
    if (offer.offerType === OFFER_TYPES.FLAT) {
      discountedPrice -= offer.value;
    } else if (offer.offerType === OFFER_TYPES.PERCENTAGE) {
      discountedPrice *= 1 - offer.value / 100;
    }
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
  }

  return Math.max(discountedPrice, 0); // Ensure price doesn't go below zero
}

async function getShopPage(req, res) {
  try {
    const { search, sort, category } = req.query;
    const query = { isListed: true };

    // Handle category filtering
    if (category && category !== "all") {
      const categoryDoc = await Category.findById(category); // Use category ID directly
      if (categoryDoc) {
        query.category = categoryDoc._id; // Assuming 'category' in query is the ID
      }
    }

    // Handle search functionality
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    let products = await Product.find(query); // Fetch products based on the query

    // Sort products if a sort option is provided
    if (sort) {
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

    const productsWithOffers = await Promise.all(
      products.map(async (product) => {
        const bestOffer = await getBestOffer(product);
        return { product, bestOffer };
      })
    );

    const categories = await Category.find({ isListed: true });

    // Assuming you have user information in req.user
    const user = req.session.user || null;

    res.render("user/shop", {
      productsWithOffers,
      categories,
      search,
      sort,
      category,
      user,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error loading shop page");
  }
}

async function getSingleProduct(req, res) {
  const { id } = req.params;
  try {
    // Fetch the product and populate the category field
    const product = await Product.findById(id).populate("category", "name");
    const categories = await Category.find({});
    const user = req.session.user; // Get the user from the session

    if (!product) {
      return res.status(404).send("Product not found");
    }

    // Get the category name
    const categoryName = product.category
      ? product.category.name
      : "Uncategorized";

    // Fetch related products from the same category
    const relatedProducts = await Product.find({
      category: product.category,
      _id: { $ne: product._id }, // Exclude the current product
    }).limit(4);

    // Get the best offer for the main product
    const bestOffer = await getBestOffer(product);

    // Get best offers for related products
    const relatedProductsWithOffers = await Promise.all(
      relatedProducts.map(async (relatedProduct) => {
        const bestOffer = await getBestOffer(relatedProduct);
        return { product: relatedProduct, bestOffer };
      })
    );

    // Calculate the discounted price for the main product if there's a best offer
    let discountedPrice = product.price;
    if (bestOffer) {
      discountedPrice = bestOffer.discountedPrice;
    }

    // Render the single product view with populated product and related products
    res.render("user/single-product", {
      user,
      product,
      bestOffer,
      discountedPrice,
      categoryName,
      categories,
      relatedProductsWithOffers,
    });
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).send("Error loading product");
  }
}

async function getUserProfile(req, res) {
  try {
    const user = req.session.user;
    res.render("user/profile", { user }); // Render the profile page
  } catch (error) {
    console.error("Error fetching user profile:", error);
    res.status(500).send("Error loading user profile");
  }
}

async function getAddresses(req, res) {
  const userId = req.session.user._id;
  try {
    const addresses = await Address.find({ userId }); // Fetch addresses associated with the user
    const user = req.session.user; // Get user from session
    res.render("user/address", { addresses, user }); // Pass user data to the template
  } catch (error) {
    console.error("Error fetching addresses:", error);
    res.status(500).send("Error fetching addresses");
  }
}
async function updateUserProfile(req, res) {
  const { firstname, lastname } = req.body;
  const userId = req.session.user._id;

  try {
    // Update user details excluding email
    await User.findByIdAndUpdate(userId, { firstname, lastname });

    // Update the session with the new user info
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
  const { email } = req.body; // Ensure email is being retrieved correctly
  const userId = req.session.user._id;

  try {
    await User.findByIdAndUpdate(userId, { email });
    req.session.user.email = email; // Update the session with the new email
    res.status(200).json({ message: "Email updated successfully" });
  } catch (error) {
    console.error("Error updating email:", error);
    res
      .status(500)
      .json({ message: "Error updating email", error: error.message });
  }
}

async function updatePhoneNumber(req, res) {
  const { phone } = req.body; // Ensure phone number is being retrieved correctly
  const userId = req.session.user._id;

  try {
    await User.findByIdAndUpdate(userId, { phoneNo: phone });
    req.session.user.phoneNo = phone; // Update the session with the new phone number
    res.status(200).json({ message: "Phone number updated successfully" });
  } catch (error) {
    console.error("Error updating phone number:", error);
    res
      .status(500)
      .json({ message: "Error updating phone number", error: error.message });
  }
}

async function changePassword(req, res) {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  const userId = req.session.user._id;

  try {
    const user = await User.findById(userId);

    // Check if the current password is correct
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    // Check if new password and confirm password match
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "New passwords do not match" });
    }

    // Hash the new password and save it
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).json({ message: "Error changing password" });
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
    // Redirect back to the address management page
    res.status(200).json({ message: "success" }); // Adjust this path as necessary
  } catch (error) {
    console.error("Error adding address:", error);
    // Handle error, possibly by redirecting back with an error message
    req.flash("error", "Error adding address");
    res.redirect("/user/address/manage"); // Redirect to the same page on error as well
  }
}

async function editAddress(req, res) {
  const { id } = req.params; // Get address ID from the URL
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

// Delete an address
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
  const { currentPassword, newPassword } = req.body;
  const userId = req.session.user._id;
  // Assuming you have user info in req.user from authentication middleware

  try {
    // Find the user by ID
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

    // Validate new password
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
        total: 50, // Only delivery charge if no items in cart
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
    // Find the user's cart
    let cart = await Cart.findOne({ user });
    if (!cart) {
      cart = new Cart({ user, products: [] });
    }

    // Retrieve the product's stock from your product model
    const product = await Product.findById(productId); // Assuming you have a Product model
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Check if the product is out of stock
    if (product.stock === 0) {
      return res.status(400).json({ message: "Product out of stock" });
    }

    // Check if only 1 quantity is left and it's already in the cart
    const existingProductIndex = cart.products.findIndex(
      (item) => item.productId.toString() === productId
    );
    if (product.stock === 1 && existingProductIndex > -1) {
      return res.status(400).json({
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
      cart.products[existingProductIndex].quantity = newQuantity; // Update quantity
    } else {
      // If the product does not exist, add it to the cart
      cart.products.push({ productId, quantity });
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

async function removeFromCart(req, res) {
  const userId = req.session.user._id; // Ensure you're using the correct property for user ID
  const { productId } = req.body;

  try {
    const cart = await Cart.findOne({ user: userId });
    if (cart) {
      // Filter out the product
      cart.products = cart.products.filter(
        (item) => item.productId.toString() !== productId
      );
      await cart.save();
      return res
        .status(200)
        .json({ message: "Item removed from cart successfully" });
    } else {
      return res.status(404).json({ message: "Cart not found" });
    }
  } catch (error) {
    console.error("Error removing item from cart:", error);
    return res.status(500).json({ message: "Error removing item from cart" });
  }
}

async function updateQuantity(req, res) {
  const userId = req.session.user._id; // Ensure you're using the correct property for user ID
  const { productId, quantity } = req.body;

  const MAX_QUANTITY = 10; // Limit for quantity of a single product

  try {
    const cart = await Cart.findOne({ user: userId });
    if (cart) {
      const productIndex = cart.products.findIndex(
        (item) => item.productId.toString() === productId
      );
      if (productIndex > -1) {
        // Check if the quantity is valid
        if (quantity < 1) {
          return res
            .status(400)
            .json({ message: "Quantity cannot be less than 1" });
        }
        // Check if the quantity exceeds the maximum allowed
        if (quantity > MAX_QUANTITY) {
          return res.status(400).json({
            message: `Cannot exceed a quantity of ${MAX_QUANTITY} for this product.`,
          });
        }

        // Retrieve the product's stock from your product model
        const product = await Product.findById(productId); // Assuming you have a Product model
        if (!product) {
          return res.status(404).json({ message: "Product not found" });
        }

        // Check if the new quantity exceeds available stock
        if (quantity > product.stock) {
          return res.status(400).json({
            message: `Only ${product.stock} of this product is available.`,
          });
        }

        // Update quantity in the cart
        cart.products[productIndex].quantity = quantity; // Update quantity
        await cart.save();
        return res
          .status(200)
          .json({ message: "Quantity updated successfully" });
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
  const userId = req.session.user?._id; // Optional chaining for safety
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
    let offerChanged = false;
    let unavailableProducts = [];
    const updatedProducts = await Promise.all(
      cart.products.map(async (item) => {
        const product = item.productId;
        if (!product.isListed || product.stock === 0) {
          unavailableProducts.push(product.name);
          return null;
        }
        const bestOffer = await getBestOffer(product);
        let price = product.price;
        if (bestOffer && bestOffer.isActive) {
          price = bestOffer.discountedPrice;
        } else if (
          item.discountedPrice &&
          item.discountedPrice !== product.price
        ) {
          offerChanged = true;
        }
        subtotal += price * item.quantity;
        return {
          ...item.toObject(),
          discountedPrice: price,
        };
      })
    );

    // Filter out null values (unavailable products)
    const availableProducts = updatedProducts.filter(
      (product) => product !== null
    );
    if (unavailableProducts.length > 0) {
      const message = `Some products are no longer available or out of stock. Please remove them from your cart: ${unavailableProducts.join(
        ", "
      )}`;
      if (
        req.headers.accept &&
        req.headers.accept.includes("application/json")
      ) {
        return res.status(400).json({ message });
      }
      return res.redirect("/user/cart");
    }

    const deliveryCharge = 50; // Fixed delivery charge
    const totalAmount = subtotal + deliveryCharge;

    let message = null;
    if (offerChanged) {
      message =
        "Some offers are no longer valid. The prices have been updated.";
    }

    // If everything is fine, render the checkout page
    if (req.headers.accept && req.headers.accept.includes("application/json")) {
      return res.json({
        /* send required data */
      });
    }

    // Render the view for standard requests
    res.render("user/checkout", {
      cart: { ...cart.toObject(), products: availableProducts },
      subtotal,
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

  // Get the user ID from the session
  const userId = req.session.user ? req.session.user._id : null;

  if (!userId) {
    return res.status(401).json({ message: "User not authenticated" });
  }

  // Find the coupon in the database
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

  // Calculate discount
  let discountAmount =
    coupon.discountType === "flat"
      ? coupon.discountAmount
      : (coupon.discountAmount / 100) * totalAmount; // Assuming discountAmount is the percentage value

  // Ensure discount does not exceed maxDiscount
  if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
    discountAmount = coupon.maxDiscount;
  }

  return res.status(200).json({ discount: discountAmount });
}

async function confirmOrder(req, res) {
  try {
    const {
      items,
      totalAmount,
      shippingAddress,
      paymentMethod,
      couponCode, // Make sure this is included
    } = req.body;

    // Cash on Delivery restriction
    if (paymentMethod === "CashOnDelivery" && totalAmount > 1000) {
      return res.status(400).json({
        message: "Cash on Delivery is not available for orders above ₹1000.",
      });
    }

    // Get the user ID from the session
    const userId = req.session.user ? req.session.user._id : null;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
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

    // Check if all products are listed
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product || !product.isListed) {
        return res.status(400).json({
          message:
            "One or more products in your order are no longer available. Please review your cart and try again.",
        });
      }
    }

    let recalculatedTotal = 0;
    let totalOfferDiscount = 0;

    for (const item of items) {
      const product = await Product.findById(item.productId);
      const bestOffer = await getBestOffer(product);
      const price =
        bestOffer && bestOffer.isActive
          ? bestOffer.discountedPrice
          : product.price;
      recalculatedTotal += price * item.quantity;

      if (bestOffer && bestOffer.isActive) {
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

      // Calculate discount
      discount =
        coupon.discountType === "flat"
          ? coupon.discountAmount
          : (coupon.discountAmount / 100) * recalculatedTotal;

      // Ensure discount does not exceed maxDiscount
      if (coupon.maxDiscount && discount > coupon.maxDiscount) {
        discount = coupon.maxDiscount;
      }
    }

    const finalTotalAmount = recalculatedTotal - discount;

    if (Math.abs(finalTotalAmount - totalAmount) > 0.01) {
      return res.status(400).json({
        message:
          "The order total has changed. Please review your cart and try again.",
      });
    }

    // Check if the total has changed
    if (Math.abs(finalTotalAmount - totalAmount) > 0.01) {
      return res.status(400).json({
        message:
          "The order total has changed. Please review your cart and try again.",
      });
    }

    const paymentStatus =
      paymentMethod === "Razorpay" || paymentMethod === "Wallet"
        ? "Failed"
        : "Successful";

    // Create a new order
    const newOrder = new Order({
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
    if (paymentMethod === "CashOnDelivery") {
      // Reduce stock for each item in the order
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

    // Respond with success message for all payment methods
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

// Example function to create a Razorpay order
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
    amount: order.totalAmount * 100, // Convert amount to paise
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

    // Find the order by orderId
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Update payment status to 'Completed'
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

// Function to get the wallet balance of the user
const getWalletBalance = async (req, res) => {
  try {
    const userId = req.session.user._id; // Get the user ID from session or JWT

    // Find the wallet associated with the user
    let wallet = await Wallet.findOne({ userId });

    // If the wallet doesn't exist, create a new one (this is optional depending on your app's behavior)
    if (!wallet) {
      wallet = new Wallet({ userId, balance: 0 }); // Create a new wallet with an initial balance of 0
      await wallet.save();
    }

    // Return the wallet balance
    return res.status(200).json({ balance: wallet.balance });
  } catch (error) {
    console.error("Error fetching wallet balance:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Function to deduct amount from the user's wallet
const deductWalletAmount = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { orderId, amount } = req.body; // Amount to deduct from the wallet

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get the user's wallet
    const wallet = await Wallet.findOne({ userId: user._id });
    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found" });
    }

    // Check if the wallet has sufficient balance
    if (wallet.balance < amount) {
      return res.status(400).json({ message: "Insufficient wallet balance" });
    }

    // Deduct the amount from the wallet balance
    wallet.balance -= amount;

    // Log the wallet transaction as a debit
    wallet.transactions.push({
      amount: amount,
      type: "debit",
      orderId: orderId,
      description: "Payment for order",
    });

    // Save the updated wallet information
    await wallet.save();

    // Update the order status to "Successful"
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    order.paymentStatus = "Successful"; // Mark as successful payment
    await order.save();

    // Respond with success message and remaining balance
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
    // Fetch the order details from the database
    const order = await Order.findById(orderId).populate("items.productId"); // Adjust the fields as needed

    if (!order) {
      return res.status(404).send("Order not found");
    }

    // Render the orderSuccess.ejs page with order details
    res.render("user/orderSuccess", { order });
  } catch (error) {
    console.error("Error fetching order details:", error);
    res.status(500).send("Internal Server Error");
  }
}

async function getUserOrders(req, res) {
  const userId = req.session.user._id;

  try {
    // Fetch user orders and sort them by createdAt (most recent first)
    const orders = await Order.find({ userId })
      .populate({
        path: "items.productId",
        populate: { path: "category" },
      })
      .sort({ createdAt: -1 }); // Sort orders by creation date

    res.render("user/orders", { orders, user: req.session.user });
  } catch (error) {
    console.error("Error fetching user orders:", error);
    res.status(500).send("Server Error: " + error.message);
  }
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

    // Pipe the PDF into the response
    doc.pipe(res);

    // Add content to the PDF
    doc.fontSize(27).text("Subtlety", { align: "center" });
    doc.fontSize(12).text("Sold by: Nandalal M", { align: "center" });
    doc.fontSize(12).text("Address: Ft44, Main Street, City Central, Delhi", {
      align: "center",
    });
    doc.moveDown(2); // Add some space

    // Shipping address
    doc.fontSize(16).text("Billing Address:", { underline: true });
    doc.moveDown(); // Add space before the address

    doc.fontSize(12).text(`Name: ${order.shippingAddress.fullname}`);
    doc.fontSize(12).text(`Address: ${order.shippingAddress.address}`);
    doc.fontSize(12).text(`Pincode: ${order.shippingAddress.pincode}`);
    doc.fontSize(12).text(`Phone No: ${order.shippingAddress.phone || "N/A"}`);
    doc.moveDown(); // Add space after billing address

    // Order summary
    doc.fontSize(16).text("Order Summary", { underline: true });
    doc.moveDown(); // Add space before the summary

    doc.fontSize(12).text(`Order ID: ${order._id}`);
    doc
      .fontSize(12)
      .text(`Order Date: ${new Date(order.orderDate).toLocaleDateString()}`);
    doc.fontSize(12).text(`Payment Method: ${order.paymentMethod}`);
    doc.moveDown(2);

    // Order summary headers (bold)
    doc.fontSize(12).font("Helvetica-Bold"); // Set font to bold
    const headerY = doc.y; // Store current Y position for headers
    doc.text("Product Name", 73, headerY, { width: 110 });
    doc.text("Product Status", 215, headerY);
    doc.text("Unit Price", 320, headerY);
    doc.text("Quantity", 390, headerY);
    doc.text("Total Price", 470, headerY);

    doc.fontSize(12).font("Helvetica"); // Reset font to regular

    let y = headerY + 20; // Start just below the headers
    let totalPaid = 0; // Initialize total paid amount

    // Loop through the order items and add them to the table
    order.items.forEach((item) => {
      const totalPrice = item.price * item.quantity;
      const isDelivered =
        item.status && item.status.trim().toLowerCase() === "delivered"; // Check if status is delivered

      doc.fontSize(12).text(`${item.productId.name}`, 73, y, { width: 110 });
      doc.fontSize(12).text(`${item.status || "N/A"}`, 215, y);
      doc.fontSize(12).text(`${item.price.toFixed(2)}`, 320, y);
      doc.fontSize(12).text(`x ${item.quantity}`, 390, y);
      doc
        .fontSize(12)
        .text(`${isDelivered ? totalPrice.toFixed(2) : "0.00"}`, 470, y); // Show total price only if delivered

      // Add to totalPaid only if delivered
      if (isDelivered) {
        totalPaid += totalPrice; // Accumulate total price for delivered items
      }

      y += 20; // Adjusted y position for the next row
    });

    // Add the total amount paid at the end, aligned to the left
    doc.moveDown(3);
    doc.font("Helvetica-Bold"); // Set font to bold for total amount text
    const totalAmountText = `Total Amount Paid: ${totalPaid.toFixed(2)}`;
    doc.fontSize(14).text(totalAmountText, 73);

    doc.font("Helvetica"); // Reset font to regular after the total amount

    // Finalize the PDF and end the stream
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

    // Update the item's status to 'Cancelled'
    order.items[itemIndex].status = "Cancelled";

    // Revert stock for the specific item
    const item = order.items[itemIndex];
    const product = await Product.findById(item.productId);
    if (product) {
      product.stock += item.quantity; // Revert stock
      await product.save();
    }

    // If payment method is Razorpay, add the price back to wallet
    if (
      order.paymentMethod === "Razorpay" ||
      order.paymentMethod === "Wallet"
    ) {
      const wallet = await Wallet.findOne({ userId: order.userId });
      if (wallet) {
        const refundAmount = item.price * item.quantity;
        wallet.balance += refundAmount;
        wallet.transactions.push({
          amount: refundAmount,
          type: "credit",
          orderId: order._id,
          description: "Refund for cancelled product",
        });
        await wallet.save();
      }
    }

    // Check product statuses to determine overall order status
    const allDelivered = order.items.every(
      (item) => item.status === "Delivered"
    );
    const allCancelled = order.items.every(
      (item) => item.status === "Cancelled"
    );
    const allReturned = order.items.every((item) => item.status === "Returned");
    const hasPending = order.items.some((item) => item.status === "Pending");
    const hasShipped = order.items.some((item) => item.status === "Shipped");
    const hasCancelled = order.items.some(
      (item) => item.status === "Cancelled"
    );
    const hasReturned = order.items.some((item) => item.status === "Returned");

    // Update order status based on the product statuses
    if (allDelivered) {
      order.orderStatus = "Completed";
    } else if (allCancelled) {
      order.orderStatus = "Cancelled";
    } else if (allReturned) {
      order.orderStatus = "Completed";
    } else if (hasCancelled && !hasPending && !hasShipped) {
      order.orderStatus = "Completed"; // Some products cancelled, none pending
    } else {
      order.orderStatus = "Pending"; // Default to pending if there are pending items
    }

    await order.save(); // Save the updated order

    return res.json({
      success: true,
      message: "Product cancelled successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
}

// Add this to your returnProduct controller
async function returnProduct(req, res) {
  const userId = req.session.user._id;
  const orderId = req.params.id;
  const productId = req.params.productId;
  const { reason } = req.body; // Get the reason for return from the request body

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

    // Create a return request instead of updating status
    const returnRequest = {
      productId: order.items[itemIndex].productId,
      reason: reason,
      requestedAt: new Date(),
      status: "Pending", // Status for admin to approve
    };

    // Store the return request in the order
    if (!order.returnRequests) {
      order.returnRequests = []; // Initialize returnRequests array if it doesn't exist
    }

    order.returnRequests.push(returnRequest); // Add the new return request

    await order.save(); // Save the updated order

    return res.json({
      success: true,
      message:
        "Return request submitted successfully. Please wait for admin approval.",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
}

async function getWallet(req, res) {
  const userId = req.session.user._id;
  const user = req.session.user;

  try {
    let wallet = await Wallet.findOne({ userId });

    if (!wallet) {
      // Create wallet if it doesn't exist
      wallet = new Wallet({ userId });
      await wallet.save();
    }

    res.render("user/userWallet", { wallet, user });
  } catch (error) {
    console.error("Error fetching wallet:", error);
    res.status(500).send("Server Error: " + error.message);
  }
}

// Send OTP for password reset
async function sendOtpForPasswordReset(req, res) {
  const { email } = req.body;

  try {
    // Check if the user exists
    const existingUser = await User.findOne({ email });
    if (!existingUser) {
      return res.status(400).send("Email not registered");
    }

    const otp = String(crypto.randomInt(100000, 999999)); // Generate a new OTP
    const otpTimestamp = Date.now(); // Get the current timestamp

    // Store user data temporarily in the session
    req.session.passwordResetUser = { email, otp, otpTimestamp };

    // Send OTP to email
    await sendOtpEmail(email, otp);

    res.status(200).json({
      message: "OTP sent to your email for password reset. Please verify.",
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error sending OTP");
  }
}

// Verify OTP for password reset
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

    // Check if the OTP has expired (valid for 60 seconds)
    const otpValidityDuration = 60 * 1000; // 60 seconds
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

// Reset Password
async function resetPassword(req, res) {
  const { email, newPassword } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update the user's password in the database
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

    const otp = String(crypto.randomInt(100000, 999999)); // Generate a new OTP
    const otpTimestamp = Date.now(); // Get the current timestamp

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
    const userId = req.session.user._id; // Assuming you are using session to store user ID
    const user = await User.findById(userId).populate("wishlisted"); // Populate the wishlisted products
    const categories = await Category.find({});

    // Fetch the best offer for each product in the user's wishlist
    const productsWithOffers = await Promise.all(
      user.wishlisted.map(async (product) => {
        const bestOffer = await getBestOffer(product);
        return { product, bestOffer };
      })
    );

    if (!user) {
      return res.status(404).send("User not found");
    }

    // Render wishlist view with user's wishlisted products and user object
    res.render("user/wishlist", {
      products: productsWithOffers,
      user,
      categories,
    });
  } catch (error) {
    console.error("Error fetching wishlist:", error);
    res.status(500).send("Server error");
  }
}

async function addToWishlist(req, res) {
  const { userId, productId } = req.body;

  try {
    // Find the user by ID
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
  const { userId } = req.body; // You might want to send the userId in the request body
  const { productId } = req.params; // Extract the productId from the URL parameters

  try {
    // Find the user by ID
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
  // Check if the user is logged in
  if (req.session.user) {
    // Remove user info from the session
    delete req.session.user;
  }
  // Optionally, you can also clear other session data if necessary

  // Redirect to login after logout
  res.redirect("/user/login");
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
  verifyOtpForPasswordReset,
  sendOtpForPasswordReset,
  resetPassword,
  resendPasswordResetOtp,
  getWishlist,
  addToWishlist,
  deleteFromWishlist,
  logout,
};
