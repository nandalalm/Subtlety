import express from 'express';
const router = express.Router();
import * as reviewController from '../controller/reviewController.js';
import { userAuthenticated, isAuthenticated } from '../middleware/authentication.js';

// User Reviews
router.post('/user/reviews/add', userAuthenticated, reviewController.postReview);
router.get('/user/reviews/load-more/:productId', reviewController.loadMoreReviews);

// Admin Reviews
router.get('/admin/reviews', isAuthenticated, reviewController.getReviews);
router.post('/admin/reviews/toggle-listing/:id', isAuthenticated, reviewController.toggleReviewStatus);

export default router;
