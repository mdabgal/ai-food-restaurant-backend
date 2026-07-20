'use strict';

const { Router } = require('express');
const { rateLimit } = require('express-rate-limit');
const { verifyToken } = require('../middleware/authMiddleware');
const { generateFoodDescription, recommendFoods } = require('../controllers/aiController');

const router = Router();

const createAiLimiter = (limit) => rateLimit({
  windowMs: 15 * 60 * 1000,
  limit,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.user.id,
  message: {
    success: false,
    message: 'AI request limit reached. Please wait before trying again.',
    code: 'AI_RATE_LIMIT',
  },
});

router.post('/description', verifyToken, createAiLimiter(10), generateFoodDescription);
router.post('/recommendations', verifyToken, createAiLimiter(20), recommendFoods);

module.exports = router;
