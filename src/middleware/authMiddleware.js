'use strict';

const { verifyToken } = require('../utils/jwt.utils');
const { sendError }   = require('../utils/response.utils');

// ─── verifyToken Middleware ───────────────────────────────────────────────────
/**
 * Middleware: verifyToken
 *
 * Accepts the JWT from either:
 *   1. HttpOnly cookie  →  req.cookies.token
 *   2. Authorization header  →  Bearer <token>  (useful for API clients / Postman)
 *
 * On success, attaches the decoded payload to req.user:
 *   { id, email, role, iat, exp }
 *
 * Usage:
 *   router.get('/protected', verifyToken, handler)
 */
const verifyTokenMiddleware = (req, res, next) => {
  // Read JWT from HttpOnly Cookie
  const token = req.cookies?.token;

  if (!token) {
    return sendError(res, 401, 'Access denied. No token provided.');
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded; // { id, email, role, iat, exp }
    next();
  } catch (err) {
    const message =
      err.name === 'TokenExpiredError'
        ? 'Token has expired. Please log in again.'
        : 'Invalid token. Authentication failed.';

    return sendError(res, 401, message);
  }
};

// ─── verifyRole Middleware ────────────────────────────────────────────────────
/**
 * Middleware: verifyRole
 *
 * Must be used AFTER verifyToken.
 * Allows only users with specific roles to proceed.
 *
 * Usage:
 *   router.get('/admin-only', verifyToken, verifyRole('admin'), handler)
 */
const verifyRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    next();
  };
};

// ─── verifyAdmin Middleware ───────────────────────────────────────────────────
/**
 * Middleware: verifyAdmin
 *
 * Must be used AFTER verifyToken.
 * Allows only users with role === 'admin' to proceed.
 *
 * Usage:
 *   router.delete('/item/:id', verifyToken, verifyAdmin, handler)
 */
const verifyAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return sendError(res, 403, 'Forbidden. Admin access required.');
  }
  next();
};

module.exports = { verifyToken: verifyTokenMiddleware, verifyRole, verifyAdmin };
