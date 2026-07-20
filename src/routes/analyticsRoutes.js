'use strict';

const { Router } = require('express');
const { getAnalytics } = require('../controllers/analyticsController');
const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

const router = Router();

// GET /api/analytics - Protected admin route
router.get('/', verifyToken, verifyRole('admin'), getAnalytics);

module.exports = router;
