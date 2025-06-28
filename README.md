# 🧢 Subtlety – Anime Merchandise E-commerce Platform

Subtlety is a full-stack anime merchandise **e-commerce platform** designed with a clean user interface and powerful admin functionalities. Built using **Node.js, Express, MongoDB**, and **EJS**, it allows users to browse, filter, and buy anime-themed products while giving admins complete control over inventory, users, and orders.

---

## 🛍️ Key Features

### 👥 User Side
- OTP-based **email sign-up/login**
- **Google login** with Passport.js OAuth
- Profile management with image uploads
- Advanced product browsing with **search, filters, and sorting**
- Wishlist, wallet system, and order tracking
- Checkout options: **Cash on Delivery**, **Razorpay**, or **Wallet**

### 🛠️ Admin Side
- User and category management with **soft delete**
- Product management with **multi-image upload & resizing**
- Full **order management**: status updates, cancellations, and invoice generation
- **Coupon and offer** management for discounts and campaigns
- **Sales reporting** with downloadable Excel reports and PDF ledger generation (via ExcelJS and PDFKit)

---

## ⚙️ Tech Stack

| Layer         | Technology                          |
|---------------|-------------------------------------|
| Backend       | Node.js, Express.js                 |
| Frontend      | EJS (server-side rendered views)    |
| Database      | MongoDB                             |
| Auth          | OTP system, Passport.js (Google)    |
| File Uploads  | Multer                              |
| Payments      | Razorpay, Wallet                    |
| Reports       | PDFKit, ExcelJS                     |
| Hosting       | AWS EC2                             |
| Proxy Server  | NGINX                               |
| API Requests  | Axios                               |

---

## 📁 Folder Structure (Backend)

```bash
src/
SUBTLETY/
├── config/             # Environment and app configuration
├── controller/         # Route handler functions (admin/user/product/etc.)
├── middleware/         # Authentication, error handling, logging
├── model/              # Mongoose schemas and data models
├── public/             # Static assets (CSS, JS, images)
├── routes/             # Express route definitions
├── uploads/            # Uploaded product images
├── views/              # EJS templates (user/admin pages)
├── app.js              # Express app setup
├── passport-setup.js   # Google OAuth setup with Passport.js
├── .env                # Environment variable definitions
├── .gitignore          # Git ignore file
├── package.json        # Project dependencies and scripts
├── package-lock.json   # Dependency lock file
```

##🚀 Getting Started

---

###1. Clone the Repository
```
git clone https://github.com/your-username/subtlety.git
cd subtlety
```

###2. Install Dependencies
```
npm install
```

###3. Create a .env file
```
PORT = 3000
EMAIL=nandalal673029@gmail.com
EMAIL_PASSWORD=zlvk rocc rxlc lblx
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
MONGO_URL = "mongodb+srv://nandalal673029:7oXzGJeNjujZLywV@cluster0.ljn4r.mongodb.net/Subtlety"
```

###4. Start the App
```
npm run dev
```
