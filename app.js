const express = require("express");
const path = require("path");
const app = express();
const session = require("express-session");
const passport = require("passport");
const cors = require("cors");
const userRoute = require("./routes/user");
const adminRoute = require("./routes/admin");
const authRoute = require("./routes/auth");
const mongoose = require('mongoose');


require("dotenv").config();
require("./passport-setup");

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Allow all origins
app.use(cors());

// Session setup
app.use(
  session({
    secret: "key",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  })
);

app.use((req, res, next) => {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  next();
});

app.use(passport.initialize());
app.use(passport.session());


app.get("/", (req, res) => {
  res.redirect("/user/home");
});
app.use("/user", userRoute);
app.use("/admin", adminRoute);
app.use("/auth", authRoute);

// Handle 404 - Not Found
app.use((req, res, next) => {
  res.status(404).render("404", { message: "Page not found!" });
});

// Handle 500 - Internal Server Error
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render("500", { message: "Something went wrong!" });
});

// MongoDB Connection
const dbURI = process.env.MONGO_URL;

const connectDB = async () => {
  try {
    await mongoose.connect(dbURI);
    console.log("Mongo DB CONNECTED SUCCESSFULLY");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
};

connectDB();

// ⭐ IMPORTANT FOR VERCEL:
module.exports = app;

// const PORT = process.env.PORT || 3000;
// app.listen(PORT, () => {
//   console.log(`Server running on http://localhost:${PORT}`);
// });

