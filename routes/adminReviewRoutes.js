import express from 'express';
const router = express.Router();
import * as reviewController from '../controller/reviewController.js';
import { isAuthenticated } from '../middleware/authentication.js';

// Base: /admin/reviews
router.get('/', isAuthenticated, reviewController.getReviews);
router.post('/toggle-listing/:id', isAuthenticated, reviewController.toggleReviewStatus);

export default router;
