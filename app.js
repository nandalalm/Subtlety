import express from "express";
import path from "path";
import session from "express-session";
import passport from "passport";
import cors from "cors";
import MongoStore from "connect-mongo";

import userRoute from "./routes/userRoutes.js";
import adminRoute from "./routes/adminRoutes.js";
import authRoute from "./routes/authRoutes.js";
import orderRoute from "./routes/orderRoutes.js";
import adminOrderRoute from "./routes/adminOrderRoutes.js";
import productRoute from "./routes/productRoutes.js";
import categoryRoute from "./routes/categoryRoutes.js";
import cartRoute from "./routes/cartRoutes.js";
import wishlistRoute from "./routes/wishlistRoutes.js";
import profileRoute from "./routes/profileRoutes.js";
import walletRoute from "./routes/walletRoutes.js";
import reviewRoute from "./routes/reviewRoutes.js";
import adminReviewRoute from "./routes/adminReviewRoutes.js";
import offerRoute from "./routes/offerRoutes.js";

import "dotenv/config";
import "./passport-setup.js";

import connectDB from "./config/db.js";
import { fileURLToPath } from 'url';

import logger from "./middleware/logger.js";
import errorHandler from "./middleware/errorHandler.js";
import HTTP_STATUS from "./Constants/httpStatus.js";
import MESSAGES from "./Constants/messages.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

connectDB();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(logger);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
// Local uploads no longer needed (moved to Cloudinary)
// app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use(cors());

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URL,
      collectionName: "sessions",
    }),
    cookie: {
      secure: false,
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);

app.use((req, res, next) => {
  if (
    !req.url.startsWith("/styles") &&
    !req.url.startsWith("/scripts") &&
    !req.url.startsWith("/images") &&
    !req.url.startsWith("/favicon")
  ) {
    res.setHeader("Cache-Control", "no-store");
  }
  next();
});

app.use(passport.initialize());
app.use(passport.session());

app.get("/", (req, res) => {
  res.redirect("/user/home");
});

app.use("/auth", authRoute);
app.use("/user", userRoute);
app.use("/cart", cartRoute);
app.use("/wishlist", wishlistRoute);
app.use("/profile", profileRoute);
app.use("/wallet", walletRoute);
app.use("/reviews", reviewRoute);
app.use("/orders", orderRoute);
app.use("/admin", adminRoute);
app.use("/admin/orders", adminOrderRoute);
app.use("/admin/products", productRoute);
app.use("/admin/categories", categoryRoute);
app.use("/admin/offers", offerRoute);
app.use("/admin/reviews", adminReviewRoute);

app.use((req, res, next) => {
  res.status(HTTP_STATUS.NOT_FOUND).render("404", { message: MESSAGES.GENERAL.PAGE_NOT_FOUND });
});

app.use(errorHandler);

export default app;

app.listen(3000, () => { console.log('Server running on http://localhost:3000') });