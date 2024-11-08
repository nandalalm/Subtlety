const express = require('express');
const router = express.Router();
const controller = require('../controller/adminController');
const { isAuthenticated, } = require('../middleware/authentication');

router.get('/login', controller.getLogin);
router.post('/login', controller.loginadmin);
router.get('/dashboard',isAuthenticated, controller.getHome);
router.get('/users',isAuthenticated, controller.getUsers);
router.post('/toggleUserStatus', controller.toggleUserStatus);
router.get('/products',isAuthenticated, controller.getProducts);
router.post('/products/add', controller.productUpload.array('images', 3), controller.addProduct);
router.post('/products/edit/:id', controller.productUpload.array('images', 3), controller.editProduct);
router.post('/products/toggle-list/:id', controller.toggleProductStatus);
router.get('/categories',isAuthenticated, controller.getCategories);
router.post('/categories/add', controller.categoryUpload.single('image'), controller.addCategory);
router.post('/categories/edit/:id', controller.categoryUpload.single('image'), controller.editCategory);
router.post('/categories/toggle-status/:id', controller.toggleCategoryStatus);
router.get('/orderList', isAuthenticated, controller.getOrders);
router.post('/order/changeProductStatus', isAuthenticated, controller.changeProductStatus);
router.get('/order/:id/details', isAuthenticated, controller.getOrderDetails);
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

module.exports = router;
