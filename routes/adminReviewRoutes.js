import express from 'express';
const router = express.Router();
import * as reviewController from '../controller/reviewController.js';
import { isAuthenticated } from '../middleware/authentication.js';
import asyncHandler from '../middleware/asyncHandler.js';

router.get('/', isAuthenticated, asyncHandler(reviewController.getReviews));
router.get('/:id/view', isAuthenticated, asyncHandler(reviewController.getReviewView));
router.post('/toggle-listing/:id', isAuthenticated, asyncHandler(reviewController.toggleReviewStatus));

export default router;
