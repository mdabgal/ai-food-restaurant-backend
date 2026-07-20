'use strict';

const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');

// ─── Collection Name ──────────────────────────────────────────────────────────
const COLLECTION = 'foods';

/**
 * Returns the MongoDB foods collection.
 */
const getFoodsCollection = () => getDB().collection(COLLECTION);

// ─── Field Validators ─────────────────────────────────────────────────────────

/**
 * Validates and sanitises food input fields.
 * Returns { errors, data } — errors is an array of messages, data is clean object.
 * @param {object}  body      - Raw request body
 * @param {boolean} isPartial - If true (PUT), only validate provided fields
 */
const validateFood = (body, isPartial = false) => {
  const errors = [];
  const data   = {};

  const { name, image, category, price, description, rating } = body;

  // name
  if (!isPartial || name !== undefined) {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      errors.push('name is required and must be a non-empty string.');
    } else {
      data.name = name.trim();
    }
  }

  // image
  if (!isPartial || image !== undefined) {
    if (!image || typeof image !== 'string' || image.trim().length === 0) {
      errors.push('image is required and must be a non-empty string (URL).');
    } else {
      data.image = image.trim();
    }
  }

  // category
  if (!isPartial || category !== undefined) {
    if (!category || typeof category !== 'string' || category.trim().length === 0) {
      errors.push('category is required and must be a non-empty string.');
    } else {
      data.category = category.trim();
    }
  }

  // price
  if (!isPartial || price !== undefined) {
    const parsedPrice = Number(price);
    if (price === undefined || price === null || isNaN(parsedPrice) || parsedPrice < 0) {
      errors.push('price is required and must be a non-negative number.');
    } else {
      data.price = parsedPrice;
    }
  }

  // description
  if (!isPartial || description !== undefined) {
    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      errors.push('description is required and must be a non-empty string.');
    } else {
      data.description = description.trim();
    }
  }

  // rating — optional, defaults to 0, must be 0–5
  if (!isPartial || rating !== undefined) {
    if (rating !== undefined && rating !== null) {
      const parsedRating = Number(rating);
      if (isNaN(parsedRating) || parsedRating < 0 || parsedRating > 5) {
        errors.push('rating must be a number between 0 and 5.');
      } else {
        data.rating = parsedRating;
      }
    } else if (!isPartial) {
      data.rating = 0; // default
    }
  }

  return { errors, data };
};

/**
 * Checks whether a string is a valid 24-character MongoDB ObjectId.
 */
const isValidObjectId = (id) => ObjectId.isValid(id) && String(new ObjectId(id)) === id;

module.exports = {
  getFoodsCollection,
  validateFood,
  isValidObjectId,
  COLLECTION,
};
