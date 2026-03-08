const express = require('express');
const router = express.Router();
const controller = require('../controller/adminController');
const { isAuthenticated, } = require('../middleware/authentication');

router.get('/login', controller.getLogin);
router.post('/login', controller.loginadmin);
router.get('/dashboard', isAuthenticated, controller.getHome);
router.get('/users', isAuthenticated, controller.getUsers);
router.post('/users/toggle-status/:id', isAuthenticated, controller.toggleUserStatus);
router.get('/products', isAuthenticated, controller.getProducts);
router.get('/products/add', isAuthenticated, controller.getAddProduct);
router.get('/products/edit/:id', isAuthenticated, controller.getEditProduct);
router.post('/products/add', isAuthenticated, controller.productUpload.any(), controller.addProduct);
router.post('/products/edit/:id', isAuthenticated, controller.productUpload.any(), controller.editProduct);
router.post('/products/toggle-list/:id', isAuthenticated, controller.toggleProductStatus);
router.get('/categories', isAuthenticated, controller.getCategories);
router.post('/categories/add', isAuthenticated, controller.categoryUpload.single('image'), controller.addCategory);
router.post('/categories/edit/:id', isAuthenticated, controller.categoryUpload.single('image'), controller.editCategory);
router.post('/categories/toggle-status/:id', isAuthenticated, controller.toggleCategoryStatus);
router.get('/orderList', isAuthenticated, controller.getOrders);
router.post('/order/changeProductStatus', isAuthenticated, controller.changeProductStatus);
router.post('/order/changeOrderStatus', isAuthenticated, controller.changeOrderStatus);
router.get('/order/:id/view', isAuthenticated, controller.getOrderView);
router.get('/order/:id/details', isAuthenticated, controller.getOrderDetailsJson);
router.post('/order/approveReturn', isAuthenticated, controller.approveReturn);
router.get('/offer', isAuthenticated, controller.getOffers);
router.post('/offers/add', isAuthenticated, controller.addOffer);
router.post('/offers/toggle-status/:id', isAuthenticated, controller.toggleOfferStatus);
router.post('/offers/edit/:id', isAuthenticated, controller.editOffer);
router.get('/coupons', isAuthenticated, controller.getCoupons);
router.post('/coupons/add', isAuthenticated, controller.addCoupon);
router.put('/coupons/:id', isAuthenticated, controller.editCoupon);
router.post('/coupons/toggle-status/:id', isAuthenticated, controller.toggleCouponStatus);
router.get('/salesReport', isAuthenticated, controller.getSalesReport);
router.post('/salesReport/generate', isAuthenticated, controller.generateSalesReport);
router.post('/salesReport/download/pdf', isAuthenticated, controller.downloadSalesReportPdf);
router.post('/salesReport/download/excel', isAuthenticated, controller.downloadSalesReportExcel);
router.post('/logout', isAuthenticated, controller.logout);

// Reviews
router.get('/reviews', isAuthenticated, controller.getReviews);
router.post('/reviews/toggle-listing/:id', isAuthenticated, controller.toggleReviewStatus);

module.exports = router;
