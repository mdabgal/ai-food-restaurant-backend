'use strict';

const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');

// /api/items is the authenticated management API for the same catalog that
// /api/foods exposes publicly. Keeping one collection prevents data drift.
const getItemsCol = () => getDB().collection('foods');

const isValidObjectId = (id) =>
  ObjectId.isValid(id) && String(new ObjectId(id)) === id;

const sendError = (res, status, message, errors = null) => {
  const body = { success: false, message };
  if (errors) body.errors = errors;
  return res.status(status).json(body);
};

const validateItem = (body, partial = false) => {
  const allowed = ['name', 'price', 'description', 'category', 'image', 'ingredients', 'rating', 'status'];
  const data = {};
  const errors = [];

  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) continue;

    if (['name', 'description', 'category', 'image'].includes(key)) {
      if (typeof body[key] !== 'string' || !body[key].trim()) {
        errors.push(`${key} must be a non-empty string.`);
      } else {
        data[key] = body[key].trim();
      }
    }

    if (key === 'ingredients') {
      if (typeof body.ingredients !== 'string') errors.push('ingredients must be a string.');
      else if (body.ingredients.trim()) data.ingredients = body.ingredients.trim().slice(0, 1000);
    }

    if (key === 'price') {
      const price = Number(body.price);
      if (!Number.isFinite(price) || price < 0) errors.push('price must be a non-negative number.');
      else data.price = price;
    }

    if (key === 'rating') {
      const rating = Number(body.rating);
      if (!Number.isFinite(rating) || rating < 0 || rating > 5) errors.push('rating must be between 0 and 5.');
      else data.rating = rating;
    }

    if (key === 'status') {
      const statuses = ['available', 'limited', 'soldout'];
      if (!statuses.includes(body.status)) errors.push(`status must be one of: ${statuses.join(', ')}.`);
      else data.status = body.status;
    }
  }

  if (!partial) {
    for (const field of ['name', 'price', 'description', 'category', 'image']) {
      if (body[field] === undefined || body[field] === null || body[field] === '') {
        errors.push(`${field} is required.`);
      }
    }
  }

  return { data, errors: [...new Set(errors)] };
};

const createItem = async (req, res) => {
  try {
    const { data, errors } = validateItem(req.body);
    if (errors.length) return sendError(res, 422, 'Validation failed.', errors);

    const newItem = {
      ...data,
      rating: data.rating ?? 0,
      status: data.status || 'available',
      createdBy: new ObjectId(req.user.id),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await getItemsCol().insertOne(newItem);
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

const getItems = async (req, res) => {
  try {
    const { category, search, sort, minRating } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;
    const filter = {};

    if (category && category !== 'all') filter.category = String(category);
    if (search) filter.$text = { $search: String(search) };
    if (minRating !== undefined && Number.isFinite(Number(minRating))) {
      filter.rating = { $gte: Number(minRating) };
    }

    let sortOption = { createdAt: -1 };
    if (sort === 'price_asc' || sort === 'asc') sortOption = { price: 1 };
    if (sort === 'price_desc' || sort === 'desc') sortOption = { price: -1 };
    if (sort === 'rating_desc') sortOption = { rating: -1 };

    const [items, total] = await Promise.all([
      getItemsCol().find(filter).sort(sortOption).skip(skip).limit(limit).toArray(),
      getItemsCol().countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Items fetched successfully',
      count: items.length,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      pagination: { page, limit, totalItems: total, totalPages: Math.ceil(total / limit) },
      data: items,
    });
  } catch (err) {
    console.error('[getItems]', err.message);
    return sendError(res, 500, 'Server error while fetching items.');
  }
};

const getMyItems = async (req, res) => {
  try {
    const items = await getItemsCol()
      .find({ createdBy: new ObjectId(req.user.id) })
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({ success: true, message: 'User items fetched successfully', data: items });
  } catch (err) {
    console.error('[getMyItems]', err.message);
    return sendError(res, 500, 'Server error while fetching your items.');
  }
};

const getItemById = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) return sendError(res, 400, 'Invalid item ID');
    const item = await getItemsCol().findOne({ _id: new ObjectId(req.params.id) });
    if (!item) return sendError(res, 404, 'Item not found');
    return res.status(200).json({ success: true, message: 'Item fetched successfully', data: item });
  } catch (err) {
    console.error('[getItemById]', err.message);
    return sendError(res, 500, 'Server error while fetching the item.');
  }
};

const updateItem = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return sendError(res, 400, 'Invalid item ID');

    const collection = getItemsCol();
    const item = await collection.findOne({ _id: new ObjectId(id) });
    if (!item) return sendError(res, 404, 'Item not found');

    const isOwner = item.createdBy?.toString() === String(req.user.id);
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) return sendError(res, 403, 'Access denied');

    const { data, errors } = validateItem(req.body, true);
    if (errors.length) return sendError(res, 422, 'Validation failed.', errors);
    if (!Object.keys(data).length) return sendError(res, 400, 'No valid fields provided for update.');

    const updatedItem = await collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { ...data, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );

    return res.status(200).json({ success: true, message: 'Item updated successfully', data: updatedItem });
  } catch (err) {
    console.error('[updateItem]', err.message);
    return sendError(res, 500, 'Server error during item update.');
  }
};

const deleteItem = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return sendError(res, 400, 'Invalid item ID');

    const collection = getItemsCol();
    const item = await collection.findOne({ _id: new ObjectId(id) });
    if (!item) return sendError(res, 404, 'Item not found');

    const isOwner = item.createdBy?.toString() === String(req.user.id);
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) return sendError(res, 403, 'Access denied');

    await collection.deleteOne({ _id: new ObjectId(id) });
    return res.status(200).json({ success: true, message: 'Item deleted successfully', data: item });
  } catch (err) {
    console.error('[deleteItem]', err.message);
    return sendError(res, 500, 'Server error during item deletion.');
  }
};

module.exports = { createItem, getItems, getMyItems, getItemById, updateItem, deleteItem };
