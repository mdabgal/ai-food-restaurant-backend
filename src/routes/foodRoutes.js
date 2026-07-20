'use strict';

const { Router }   = require('express');
const { ObjectId } = require('mongodb');
const { getDB }    = require('../config/db');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');

const router     = Router();
const COLLECTION = 'foods';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const col       = () => getDB().collection(COLLECTION);
const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });
const isValidId = (id) => ObjectId.isValid(id) && String(new ObjectId(id)) === id;
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ─── GET /api/foods ───────────────────────────────────────────────────────────
// Query params:
//   ?search=      search by food name (case-insensitive)
//   ?category=    filter by category (exact, case-insensitive)
//   ?minRating=   filter foods with rating >= value
//   ?sort=        price_asc | price_desc | newest (default)
//   ?page=        page number (default 1)
//   ?limit=       items per page (default 10)
router.get('/', async (req, res) => {
  try {
    const { category, search, sort, minRating, minPrice, maxPrice } = req.query;

    // ── Parse & validate pagination params ──────────────────────────────────
    const requestedPage = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));

    // ── Build filter ──────────────────────────────────────────────────────
    const filter = {};

    if (category) {
      filter.category = { $regex: new RegExp(`^${escapeRegex(category)}$`, 'i') };
    }

    if (search) {
      filter.$or = [
        { name:        { $regex: new RegExp(escapeRegex(search), 'i') } },
        { description: { $regex: new RegExp(escapeRegex(search), 'i') } },
      ];
    }

    if (minRating !== undefined) {
      const parsedRating = parseFloat(minRating);
      if (!isNaN(parsedRating)) {
        filter.rating = { $gte: parsedRating };
      }
    }

    const parsedMinPrice = Number(minPrice);
    const parsedMaxPrice = Number(maxPrice);
    if ((minPrice !== undefined && Number.isFinite(parsedMinPrice)) ||
        (maxPrice !== undefined && Number.isFinite(parsedMaxPrice))) {
      filter.price = {};
      if (minPrice !== undefined && Number.isFinite(parsedMinPrice)) filter.price.$gte = parsedMinPrice;
      if (maxPrice !== undefined && Number.isFinite(parsedMaxPrice)) filter.price.$lte = parsedMaxPrice;
    }

    // ── Sort option ───────────────────────────────────────────────────────
    let sortOption = { createdAt: -1, _id: -1 };
    if (sort === 'price_asc')  sortOption = { price: 1, _id: 1 };
    if (sort === 'price_desc') sortOption = { price: -1, _id: -1 };
    if (sort === 'rating_desc') sortOption = { rating: -1, _id: -1 };

    // ── Execute query with pagination ─────────────────────────────────────
    const total = await col().countDocuments(filter);
    const totalPages = Math.ceil(total / limit);
    const currentPage = Math.min(requestedPage, Math.max(1, totalPages));
    const skip = (currentPage - 1) * limit;
    const foods = await col().find(filter).sort(sortOption).skip(skip).limit(limit).toArray();

    res.status(200).json({
      success:    true,
      count:      foods.length,
      total,
      currentPage,
      limit,
      totalPages,
      pagination: {
        total,
        currentPage,
        limit,
        totalPages,
      },
      data:       foods,
    });
  } catch (error) {
    console.error('[GET /api/foods]', error.message);
    sendError(res, 500, 'Server error while fetching food items.');
  }
});

// ─── GET /api/foods/:id ───────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return sendError(res, 400, `"${id}" is not a valid food ID.`);
  }

  try {
    const food = await col().findOne({ _id: new ObjectId(id) });

    if (!food) {
      return sendError(res, 404, `Food item with ID "${id}" not found.`);
    }

    res.status(200).json({ success: true, data: food });
  } catch (error) {
    console.error('[GET /api/foods/:id]', error.message);
    sendError(res, 500, 'Server error while fetching the food item.');
  }
});

// ─── POST /api/foods  (Admin only) ───────────────────────────────────────────
router.post('/', verifyToken, verifyAdmin, async (req, res) => {
  const { name, image, category, price, description, rating } = req.body;
  const errors = [];

  if (!name?.trim())        errors.push('name is required.');
  if (!image?.trim())       errors.push('image URL is required.');
  if (!category?.trim())    errors.push('category is required.');
  if (!description?.trim()) errors.push('description is required.');

  const parsedPrice = Number(price);
  if (price === undefined || price === null || isNaN(parsedPrice) || parsedPrice < 0) {
    errors.push('price must be a non-negative number.');
  }

  if (errors.length > 0) {
    return res.status(422).json({ success: false, message: 'Validation failed.', errors });
  }

  try {
    const newFood = {
      name:        name.trim(),
      image:       image.trim(),
      category:    category.trim(),
      price:       parsedPrice,
      description: description.trim(),
      rating:      rating !== undefined ? Number(rating) : 0,
      createdAt:   new Date(),
    };

    const result = await col().insertOne(newFood);

    res.status(201).json({
      success: true,
      message: 'Food item created successfully.',
      data:    { _id: result.insertedId, ...newFood },
    });
  } catch (error) {
    console.error('[POST /api/foods]', error.message);
    sendError(res, 500, 'Server error while creating the food item.');
  }
});

// ─── PUT /api/foods/:id  (Admin only) ─────────────────────────────────────────
router.put('/:id', verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return sendError(res, 400, `"${id}" is not a valid food ID.`);
  }

  if (Object.keys(req.body).length === 0) {
    return sendError(res, 400, 'No valid fields provided for update.');
  }

  const allowed = ['name', 'image', 'category', 'price', 'description', 'rating'];
  const update  = {};

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      update[key] = req.body[key];
    }
  }

  if (Object.keys(update).length === 0) {
    return sendError(res, 400, 'No valid fields provided for update.');
  }

  try {
    const result = await col().findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { ...update, updatedAt: new Date() } },
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
    console.error('[PUT /api/foods/:id]', error.message);
    sendError(res, 500, 'Server error while updating the food item.');
  }
});

// ─── DELETE /api/foods/:id  (Admin only) ──────────────────────────────────────
router.delete('/:id', verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return sendError(res, 400, `"${id}" is not a valid food ID.`);
  }

  try {
    const result = await col().findOneAndDelete({ _id: new ObjectId(id) });

    if (!result) {
      return sendError(res, 404, `Food item with ID "${id}" not found.`);
    }

    res.status(200).json({
      success: true,
      message: 'Food item deleted successfully.',
      data:    result,
    });
  } catch (error) {
    console.error('[DELETE /api/foods/:id]', error.message);
    sendError(res, 500, 'Server error while deleting the food item.');
  }
});

module.exports = router;
