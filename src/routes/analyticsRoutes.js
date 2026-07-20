'use strict';

const { Router } = require('express');
const { getAnalytics, getPublicAnalytics, getUserDashboard } = require('../controllers/analyticsController');
const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

const router = Router();

router.get('/public', getPublicAnalytics);
router.get('/dashboard', verifyToken, getUserDashboard);

// GET /api/analytics - Protected admin route
router.get('/', verifyToken, verifyRole('admin'), getAnalytics);

module.exports = router;
