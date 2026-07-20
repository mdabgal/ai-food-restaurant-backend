'use strict';

const { Router } = require('express');
const {
  getUsers,
  updateUserRole,
  getUserById,
  deleteUser,
} = require('../controllers/userController');
const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

const router = Router();

// ─── Admin Only Routes ────────────────────────────────────────────────────────
router.get('/', verifyToken, verifyRole('admin'), getUsers);
router.patch('/:id/role', verifyToken, verifyRole('admin'), updateUserRole);
router.delete('/:id', verifyToken, verifyRole('admin'), deleteUser);

// ─── Admin or Self Routes ──────────────────────────────────────────────────────
router.get('/:id', verifyToken, getUserById);

module.exports = router;
