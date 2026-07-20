'use strict';

const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');

// Helper to get collection
const getFoodsCol = () => getDB().collection("foods");
const getItemsCol = () => getDB().collection("items");

// Helper to check for valid ObjectId
const isValidObjectId = (id) => ObjectId.isValid(id) && String(new ObjectId(id)) === id;

// Helper to send standard error responses
const sendError = (res, status, message, errors = null) => {
  const body = { success: false, message };
  if (errors) body.errors = errors;
  return res.status(status).json(body);
};

// ─── POST /api/items (Protected) ────────────────────────────────────────────────
const createItem = async (req, res) => {
  try {
    const { name, price, description, category, image } = req.body;
    const errors = [];

    // Validation
    if (!name?.trim()) errors.push('name is required.');
    if (!category?.trim()) errors.push('category is required.');
    if (!description?.trim()) errors.push('description is required.');

    const parsedPrice = Number(price);
    if (price === undefined || price === null || isNaN(parsedPrice) || parsedPrice < 0) {
      errors.push('price must be a non-negative number.');
    }

    if (errors.length > 0) {
      return sendError(res, 422, 'Validation failed.', errors);
    }

    const createdBy = new ObjectId(req.user.id);
    const createdAt = new Date();

    const newItem = {
      name: name.trim(),
      price: parsedPrice,
      description: description.trim(),
      category: category.trim(),
      image: image?.trim() || null,
      createdBy,
      createdAt,
    };

    const itemsCol = getItemsCol();
    const result = await itemsCol.insertOne(newItem);

    return res.status(201).json({
      success: true,
      message: 'Item created successfully',
      data: { _id: result.insertedId, ...newItem },
    });

  } catch (err) {
    console.error('[createItem]', err.message);
    return sendError(res, 500, 'Server error during item creation.');
  }
};

// ─── GET /api/items (Public) ─────────────────────────────────────────────────────
const getItems = async (req, res) => {
  try {
    const { category, search, sort } = req.query;

    // Parse and validate pagination params
    const page  = Math.max(1, parseInt(req.query.page,  10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip  = (page - 1) * limit;

    // Build filter query
    const filter = {};

    if (category) {
      filter.category = { $regex: new RegExp(`^${category}$`, 'i') };
    }

    if (search) {
      filter.$or = [
        { name:        { $regex: new RegExp(search, 'i') } },
        { description: { $regex: new RegExp(search, 'i') } },
      ];
    }

    // Sort options
    let sortOption = { createdAt: -1 }; // Default newest first
    if (sort === 'price_asc' || sort === 'asc')   sortOption = { price: 1 };
    if (sort === 'price_desc' || sort === 'desc') sortOption = { price: -1 };

    const itemsCol = getItemsCol();
    const [items, total] = await Promise.all([
      itemsCol.find(filter).sort(sortOption).skip(skip).limit(limit).toArray(),
      itemsCol.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Items fetched successfully',
      count: items.length,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      data: items,
    });

  } catch (err) {
    console.error('[getItems]', err.message);
    return sendError(res, 500, 'Server error while fetching items.');
  }
};

// ─── GET /api/items/my (Protected) ───────────────────────────────────────────────
const getMyItems = async (req, res) => {
  try {
    const itemsCol = getItemsCol();
    const items = await itemsCol
      .find({ createdBy: new ObjectId(req.user.id) })
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      message: 'User items fetched successfully',
      data: items,
    });

  } catch (err) {
    console.error('[getMyItems]', err.message);
    return sendError(res, 500, 'Server error while fetching your items.');
  }
};

// ─── GET /api/items/:id (Public) ─────────────────────────────────────────────────
const getItemById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return sendError(res, 400, 'Invalid item ID');
    }

    const itemsCol = getItemsCol();
    const item = await itemsCol.findOne({ _id: new ObjectId(id) });

    if (!item) {
      return sendError(res, 404, 'Item not found');
    }

    return res.status(200).json({
      success: true,
      message: 'Item fetched successfully',
      data: item,
    });

  } catch (err) {
    console.error('[getItemById]', err.message);
    return sendError(res, 500, 'Server error while fetching the item.');
  }
};

// ─── DELETE /api/items/:id (Protected) ────────────────────────────────────────────
const deleteItem = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return sendError(res, 400, 'Invalid item ID');
    }

    const itemsCol = getItemsCol();
    const item = await itemsCol.findOne({ _id: new ObjectId(id) });

    if (!item) {
      return sendError(res, 404, 'Item not found');
    }

    // Role check: admin can delete any, user only their own
    const isOwner = item.createdBy?.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    await itemsCol.deleteOne({ _id: new ObjectId(id) });

    return res.status(200).json({
      success: true,
      message: 'Item deleted successfully',
      data: item,
    });

  } catch (err) {
    console.error('[deleteItem]', err.message);
    return sendError(res, 500, 'Server error during item deletion.');
  }
};

module.exports = {
  createItem,
  getItems,
  getMyItems,
  getItemById,
  deleteItem,
};
