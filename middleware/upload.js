import path from "path";
import multer from "multer";
import { categoryStorage, productStorage } from "../config/cloudinary.js";
import MESSAGES from "../Constants/messages.js";

const productUpload = multer({
  storage: productStorage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|webp/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error(MESSAGES.PRODUCT.FILE_TYPE_ERROR + filetypes));
  },
});

const categoryUpload = multer({
  storage: categoryStorage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|webp/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error(MESSAGES.CATEGORY.FILE_TYPE_ERROR + filetypes));
  },
});

export {
  productUpload,
  categoryUpload
};
