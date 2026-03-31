import express from "express";
const router = express.Router();
import * as controller from "../controller/orderController.js";
import { isAuthenticated } from "../middleware/authentication.js";

router.get('/', isAuthenticated, controller.getAdminOrders);

router.get('/sales-report', isAuthenticated, controller.getSalesReport);
router.post('/sales-report/generate', isAuthenticated, controller.generateSalesReport);
router.post('/sales-report/download/pdf', isAuthenticated, controller.downloadSalesReportPdf);
router.post('/sales-report/download/excel', isAuthenticated, controller.downloadSalesReportExcel);

router.get('/:id', isAuthenticated, controller.getAdminOrderView);
router.get('/:id/view', isAuthenticated, controller.getAdminOrderView);
router.get('/:id/details', isAuthenticated, controller.getAdminOrderDetailsJson);
router.post('/change-item-status', isAuthenticated, controller.changeProductStatus);
router.post('/change-order-status', isAuthenticated, controller.changeOrderStatus);
router.post('/approve-return', isAuthenticated, controller.approveReturn);

export default router;
