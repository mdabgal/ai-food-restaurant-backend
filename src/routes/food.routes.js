'use strict';

const { Router } = require('express');
const {
  getAllFoods,
  getFoodById,
  createFood,
  updateFood,
  deleteFood,
} = require('../controllers/food.controller');

const router = Router();

// ─── Food Routes ─────────────────────────────────────────────────────────────
// GET    /api/foods          → list all foods (supports ?category, ?search, ?sort)
// GET    /api/foods/:id      → get food by ID
// POST   /api/foods          → create a new food
// PUT    /api/foods/:id      → update food by ID
// DELETE /api/foods/:id      → delete food by ID

router.get('/',     getAllFoods);
router.get('/:id',  getFoodById);
router.post('/',    createFood);
router.put('/:id',  updateFood);
router.delete('/:id', deleteFood);

module.exports = router;
