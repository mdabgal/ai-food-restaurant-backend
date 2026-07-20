'use strict';

/**
 * Centralized API response helpers.
 * Keeps controller code clean and response shape consistent.
 */

/**
 * Send a success response.
 * @param {object} res      - Express response object
 * @param {number} status   - HTTP status code (default 200)
 * @param {string} message  - Human-readable message
 * @param {object} [data]   - Optional payload
 */
const sendSuccess = (res, status = 200, message, data = {}) => {
  return res.status(status).json({
    success: true,
    message,
    ...data,
  });
};

/**
 * Send an error response.
 * @param {object} res      - Express response object
 * @param {number} status   - HTTP status code
 * @param {string} message  - Human-readable error message
 * @param {object} [errors] - Optional validation errors object
 */
const sendError = (res, status, message, errors = null) => {
  const body = { success: false, message };
  if (errors) body.errors = errors;
  return res.status(status).json(body);
};

module.exports = { sendSuccess, sendError };
