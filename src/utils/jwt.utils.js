'use strict';

const jwt = require('jsonwebtoken');

const JWT_SECRET     = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Cookie options — shared between login and logout handlers
const COOKIE_OPTIONS = {
  httpOnly: true,                               // Not accessible via JS → prevents XSS
  secure:   process.env.NODE_ENV === 'production', // HTTPS only in production
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // CSRF protection
  maxAge:   7 * 24 * 60 * 60 * 1000,           // 7 days in milliseconds
  path:     '/',
};

/**
 * Sign a JWT token for a given payload.
 * @param {object} payload - e.g. { id, email, role }
 * @returns {string} signed JWT
 */
const signToken = (payload) => {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not defined in environment variables.');
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

/**
 * Verify and decode a JWT token.
 * Throws if invalid or expired.
 * @param {string} token
 * @returns {object} decoded payload
 */
const verifyToken = (token) => {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not defined in environment variables.');
  }
  return jwt.verify(token, JWT_SECRET);
};

/**
 * Set a signed JWT as an HttpOnly cookie on the response.
 * @param {object} res       - Express response object
 * @param {string} token     - Signed JWT string
 */
const attachCookie = (res, token) => {
  res.cookie('token', token, COOKIE_OPTIONS);
};

/**
 * Clear the JWT cookie (used during logout).
 * @param {object} res - Express response object
 */
const clearCookie = (res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path:     '/',
  });
};

module.exports = { signToken, verifyToken, attachCookie, clearCookie, COOKIE_OPTIONS };
