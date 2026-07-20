'use strict';

const { Router } = require('express');
const { register, login, logout, getMe } = require('../controllers/authController');
const { verifyToken }                     = require('../middleware/authMiddleware');

const router = Router();

// ─── Public Routes ────────────────────────────────────────────────────────────
// POST /api/auth/register  → Create a new user account
router.post('/register', register);

// POST /api/auth/login     → Authenticate user and set JWT cookie
router.post('/login', login);

// POST /api/auth/logout    → Clear JWT cookie
router.post('/logout', logout);

// ─── Protected Routes ─────────────────────────────────────────────────────────
// GET  /api/auth/me        → Return current authenticated user profile
router.get('/me', verifyToken, getMe);

module.exports = router;
