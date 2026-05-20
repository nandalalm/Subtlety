import express from "express";
const router = express.Router();
import * as controller from "../controller/orderController.js";
import { isAuthenticated } from "../middleware/authentication.js";
import asyncHandler from "../middleware/asyncHandler.js";

router.get('/', isAuthenticated, asyncHandler(controller.getAdminOrders));

router.get('/sales-report', isAuthenticated, asyncHandler(controller.getSalesReport));
router.post('/sales-report/generate', isAuthenticated, asyncHandler(controller.generateSalesReport));
router.post('/sales-report/download/pdf', isAuthenticated, asyncHandler(controller.downloadSalesReportPdf));
router.post('/sales-report/download/excel', isAuthenticated, asyncHandler(controller.downloadSalesReportExcel));

router.get('/:id', isAuthenticated, asyncHandler(controller.getAdminOrderView));
router.get('/:id/view', isAuthenticated, asyncHandler(controller.getAdminOrderView));
router.get('/:id/details', isAuthenticated, asyncHandler(controller.getAdminOrderDetailsJson));
router.post('/change-item-status', isAuthenticated, asyncHandler(controller.changeProductStatus));
router.post('/change-order-status', isAuthenticated, asyncHandler(controller.changeOrderStatus));
router.post('/approve-return', isAuthenticated, asyncHandler(controller.approveReturn));

export default router;
