'use strict';

const { Router } = require('express');
const {
  createItem,
  getItems,
  getMyItems,
  getItemById,
  updateItem,
  deleteItem,
} = require('../controllers/itemController');
const { verifyToken } = require('../middleware/authMiddleware');

const router = Router();

// ─── Protected specific routes first to avoid route collision ──────────────────
router.get('/my', verifyToken, getMyItems);

// ─── Public routes ────────────────────────────────────────────────────────────
router.get('/', getItems);
router.get('/:id', getItemById);

// ─── Protected CRUD routes ────────────────────────────────────────────────────
router.post('/', verifyToken, createItem);
router.put('/:id', verifyToken, updateItem);
router.delete('/:id', verifyToken, deleteItem);

module.exports = router;
