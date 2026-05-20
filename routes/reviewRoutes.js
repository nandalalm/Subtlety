import express from 'express';
const router = express.Router();
import * as reviewController from '../controller/reviewController.js';
import { userAuthenticated } from '../middleware/authentication.js';
import asyncHandler from '../middleware/asyncHandler.js';

router.post('/add', userAuthenticated, asyncHandler(reviewController.postReview));
router.get('/load-more/:productId', asyncHandler(reviewController.loadMoreReviews));

export default router;
