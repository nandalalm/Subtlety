import express from 'express';
const router = express.Router();
import * as reviewController from '../controller/reviewController.js';
import { isAuthenticated } from '../middleware/authentication.js';

router.get('/', isAuthenticated, reviewController.getReviews);
router.get('/:id/view', isAuthenticated, reviewController.getReviewView);
router.post('/toggle-listing/:id', isAuthenticated, reviewController.toggleReviewStatus);

export default router;
