const express = require("express");
const path = require("path");
const session = require("express-session");
const passport = require("passport");
const cors = require("cors");
const MongoStore = require("connect-mongo");

const userRoute = require("./routes/user");
const adminRoute = require("./routes/admin");
const authRoute = require("./routes/auth");

require("dotenv").config();
require("./passport-setup");

const connectDB = require("./config/db");

const app = express();

connectDB();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

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
    !req.url.startsWith("/uploads") &&
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

app.use("/user", userRoute);
app.use("/admin", adminRoute);
app.use("/auth", authRoute);

app.use((req, res, next) => {
  res.status(404).render("404", { message: "Page not found!" });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render("500", { message: "Something went wrong!" });
});

module.exports = app;

// app.listen(3000, () => { console.log('Server running on http://localhost:3000') });