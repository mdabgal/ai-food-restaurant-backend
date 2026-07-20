'use strict';

const { ObjectId } = require('mongodb');
const {
  getFoodsCollection,
  validateFood,
  isValidObjectId,
} = require('../models/food.model');

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Sends a consistent error response.
 */
const sendError = (res, statusCode, message) =>
  res.status(statusCode).json({ success: false, message });

// ─── GET /api/foods ───────────────────────────────────────────────────────────
/**
 * Retrieve all food items.
 * Supports optional query filters: ?category=&search=&sort=price_asc|price_desc
 */
const getAllFoods = async (req, res) => {
  try {
    const { category, search, sort } = req.query;
    const filter = {};

    // Filter by category (case-insensitive)
    if (category) {
      filter.category = { $regex: new RegExp(`^${category}$`, 'i') };
    }

    // Full-text search on name or description
    if (search) {
      filter.$or = [
        { name:        { $regex: new RegExp(search, 'i') } },
        { description: { $regex: new RegExp(search, 'i') } },
      ];
    }

    // Sort options
    let sortOption = { createdAt: -1 }; // default: newest first
    if (sort === 'price_asc')  sortOption = { price:  1 };
    if (sort === 'price_desc') sortOption = { price: -1 };

    const foods = await getFoodsCollection()
      .find(filter)
      .sort(sortOption)
      .toArray();

    res.status(200).json({
      success: true,
      count:   foods.length,
      data:    foods,
    });
  } catch (error) {
    console.error('[getAllFoods]', error.message);
    sendError(res, 500, 'Server error while fetching food items.');
  }
};

// ─── GET /api/foods/:id ───────────────────────────────────────────────────────
/**
 * Retrieve a single food item by MongoDB ObjectId.
 */
const getFoodById = async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    return sendError(res, 400, `"${id}" is not a valid food ID.`);
  }

  try {
    const food = await getFoodsCollection().findOne({ _id: new ObjectId(id) });

    if (!food) {
      return sendError(res, 404, `Food item with ID "${id}" not found.`);
    }

    res.status(200).json({ success: true, data: food });
  } catch (error) {
    console.error('[getFoodById]', error.message);
    sendError(res, 500, 'Server error while fetching the food item.');
  }
};

// ─── POST /api/foods ──────────────────────────────────────────────────────────
/**
 * Create a new food item.
 */
const createFood = async (req, res) => {
  const { errors, data } = validateFood(req.body, false);

  if (errors.length > 0) {
    return res.status(422).json({ success: false, message: 'Validation failed.', errors });
  }

  try {
    const newFood = {
      ...data,
      createdAt: new Date(),
    };

    const result = await getFoodsCollection().insertOne(newFood);

    res.status(201).json({
      success: true,
      message: 'Food item created successfully.',
      data:    { _id: result.insertedId, ...newFood },
    });
  } catch (error) {
    console.error('[createFood]', error.message);
    sendError(res, 500, 'Server error while creating the food item.');
  }
};

// ─── PUT /api/foods/:id ───────────────────────────────────────────────────────
/**
 * Update an existing food item (full or partial update).
 */
const updateFood = async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    return sendError(res, 400, `"${id}" is not a valid food ID.`);
  }

  const { errors, data } = validateFood(req.body, true);

  if (errors.length > 0) {
    return res.status(422).json({ success: false, message: 'Validation failed.', errors });
  }

  if (Object.keys(data).length === 0) {
    return sendError(res, 400, 'No valid fields provided for update.');
  }

  try {
    const result = await getFoodsCollection().findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { ...data, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );

    if (!result) {
      return sendError(res, 404, `Food item with ID "${id}" not found.`);
    }

    res.status(200).json({
      success: true,
      message: 'Food item updated successfully.',
      data:    result,
    });
  } catch (error) {
    console.error('[updateFood]', error.message);
    sendError(res, 500, 'Server error while updating the food item.');
  }
};

// ─── DELETE /api/foods/:id ────────────────────────────────────────────────────
/**
 * Delete a food item by ID.
 */
const deleteFood = async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    return sendError(res, 400, `"${id}" is not a valid food ID.`);
  }

  try {
    const result = await getFoodsCollection().findOneAndDelete({
      _id: new ObjectId(id),
    });

    if (!result) {
      return sendError(res, 404, `Food item with ID "${id}" not found.`);
    }

    res.status(200).json({
      success: true,
      message: 'Food item deleted successfully.',
      data:    result,
    });
  } catch (error) {
    console.error('[deleteFood]', error.message);
    sendError(res, 500, 'Server error while deleting the food item.');
  }
};

module.exports = {
  getAllFoods,
  getFoodById,
  createFood,
  updateFood,
  deleteFood,
};
