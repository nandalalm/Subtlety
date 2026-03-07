const express = require('express');
const router = express.Router();
const controller = require('../controller/adminController');
const { isAuthenticated, } = require('../middleware/authentication');

router.get('/login', controller.getLogin);
router.post('/login', controller.loginadmin);
router.get('/dashboard', isAuthenticated, controller.getHome);
router.get('/users', isAuthenticated, controller.getUsers);
router.post('/users/toggle-status/:id', controller.toggleUserStatus);
router.get('/products', isAuthenticated, controller.getProducts);
router.get('/products/add', isAuthenticated, controller.getAddProduct);
router.get('/products/edit/:id', isAuthenticated, controller.getEditProduct);
router.post('/products/add', controller.productUpload.any(), controller.addProduct);
router.post('/products/edit/:id', controller.productUpload.any(), controller.editProduct);
router.post('/products/toggle-list/:id', controller.toggleProductStatus);
router.get('/categories', isAuthenticated, controller.getCategories);
router.post('/categories/add', controller.categoryUpload.single('image'), controller.addCategory);
router.post('/categories/edit/:id', controller.categoryUpload.single('image'), controller.editCategory);
router.post('/categories/toggle-status/:id', controller.toggleCategoryStatus);
router.get('/orderList', isAuthenticated, controller.getOrders);
router.post('/order/changeProductStatus', isAuthenticated, controller.changeProductStatus);
router.post('/order/changeOrderStatus', isAuthenticated, controller.changeOrderStatus);
router.get('/order/:id/view', isAuthenticated, controller.getOrderView);
router.get('/order/:id/details', isAuthenticated, controller.getOrderDetailsJson);
router.post('/order/approveReturn', controller.approveReturn);
router.get('/offer', isAuthenticated, controller.getOffers);
router.post('/offers/add', controller.addOffer);
router.post('/offers/toggle-status/:id', controller.toggleOfferStatus);
router.post('/offers/edit/:id', controller.editOffer);
router.get('/coupons', isAuthenticated, controller.getCoupons);
router.post('/coupons/add', controller.addCoupon);
router.put('/coupons/:id', controller.editCoupon);
router.post('/coupons/toggle-status/:id', controller.toggleCouponStatus);
router.get('/salesReport', isAuthenticated, controller.getSalesReport);
router.post('/salesReport/generate', isAuthenticated, controller.generateSalesReport);
router.post('/salesReport/download/pdf', isAuthenticated, controller.downloadSalesReportPdf);
router.post('/salesReport/download/excel', isAuthenticated, controller.downloadSalesReportExcel);
router.post('/logout', controller.logout);

// Reviews
router.get('/reviews', isAuthenticated, controller.getReviews);
router.post('/reviews/toggle-listing/:id', isAuthenticated, controller.toggleReviewStatus);

module.exports = router;
