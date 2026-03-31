import express from 'express';
const router = express.Router();
import * as reviewController from '../controller/reviewController.js';
import { userAuthenticated } from '../middleware/authentication.js';

router.post('/add', userAuthenticated, reviewController.postReview);
router.get('/load-more/:productId', reviewController.loadMoreReviews);

export default router;
