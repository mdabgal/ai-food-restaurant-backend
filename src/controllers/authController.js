'use strict';

const bcrypt = require('bcryptjs');
const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');
const { signToken, attachCookie, clearCookie } = require('../utils/jwt.utils');
const { sendSuccess, sendError } = require('../utils/response.utils');

// ─── POST /api/auth/register ──────────────────────────────────────────────────
/**
 * Register a new user account.
 *
 * Body: { name, email, password, image? }
 * Success (201): Returns user object (no password) + sets HttpOnly JWT cookie.
 */
const register = async (req, res) => {
  try {
    const { name, email, password, image } = req.body;

    // ── Field presence validation ──────────────────────────────────────────────
    if (!name?.trim()) {
      return sendError(res, 400, 'Name is required.');
    }
    if (!email?.trim()) {
      return sendError(res, 400, 'Email is required.');
    }
    if (!password) {
      return sendError(res, 400, 'Password is required.');
    }

    // ── Email format validation ────────────────────────────────────────────────
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return sendError(res, 400, 'Please provide a valid email address.');
    }

    // ── Password length validation ─────────────────────────────────────────────
    if (password.length < 6) {
      return sendError(res, 400, 'Password must be at least 6 characters long.');
    }

    const db = getDB();
    const usersCol = db.collection('users');

    // ── Duplicate email check ──────────────────────────────────────────────────
    const existing = await usersCol.findOne({ email: email.trim().toLowerCase() });
    if (existing) {
      return sendError(res, 409, 'An account with this email already exists.');
    }

    // ── Hash password using bcrypt ─────────────────────────────────────────────
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    // ── Save user to MongoDB (Native driver) ──────────────────────────────────
    const newUser = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      image: image?.trim() || null,
      role: 'user', // Default role = "user"
      createdAt: new Date(),
    };

    const result = await usersCol.insertOne(newUser);

    // ── Sign JWT ───────────────────────────────────────────────────────────────
    const token = signToken({
      id: result.insertedId,
      email: newUser.email,
      role: newUser.role,
    });

    // ── Store JWT in HttpOnly cookie ───────────────────────────────────────────
    attachCookie(res, token);

    // Return user info without password
    const { password: _, ...userWithoutPassword } = newUser;

    return sendSuccess(res, 201, 'Account created successfully.', {
      token,
      user: { _id: result.insertedId, ...userWithoutPassword },
    });

  } catch (err) {
    console.error('[register]', err.message);
    return sendError(res, 500, 'Server error during registration.');
  }
};

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
/**
 * Authenticate a user and issue a JWT.
 *
 * Body: { email, password }
 * Success (200): Returns user object (no password) + sets HttpOnly JWT cookie.
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // ── Validate presence ──────────────────────────────────────────────────────
    if (!email?.trim() || !password) {
      return sendError(res, 400, 'Email and password are required.');
    }

    const db = getDB();
    const usersCol = db.collection('users');

    // ── Fetch user ─────────────────────────────────────────────────────────────
    const user = await usersCol.findOne({ email: email.trim().toLowerCase() });

    // Generic message prevents user enumeration
    if (!user) {
      return sendError(res, 401, 'Invalid email or password.');
    }

    // ── Verify password ────────────────────────────────────────────────────────
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return sendError(res, 401, 'Invalid email or password.');
    }

    // ── Sign JWT ───────────────────────────────────────────────────────────────
    const token = signToken({
      id: user._id,
      email: user.email,
      role: user.role,
    });

    // ── Store JWT in HttpOnly cookie ───────────────────────────────────────────
    attachCookie(res, token);

    // Return user info without password
    const { password: _, ...userWithoutPassword } = user;

    return sendSuccess(res, 200, 'Logged in successfully.', {
      token,
      user: userWithoutPassword,
    });

  } catch (err) {
    console.error('[login]', err.message);
    return sendError(res, 500, 'Server error during login.');
  }
};

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
/**
 * Log out the current user by clearing the JWT cookie.
 *
 * No body required.
 * Success (200): Cookie cleared.
 */
const logout = async (req, res) => {
  try {
    clearCookie(res);
    return res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (err) {
    console.error('[logout]', err.message);
    return sendError(res, 500, 'Server error during logout.');
  }
};

// ─── GET /api/auth/me  (protected) ───────────────────────────────────────────
/**
 * Return the currently authenticated user's profile.
 *
 * Requires: verifyToken middleware (populates req.user).
 * Success (200): Returns user object without password.
 */
const getMe = async (req, res) => {
  try {
    const db = getDB();
    const usersCol = db.collection('users');

    // Fetch user by ID
    const user = await usersCol.findOne({ _id: new ObjectId(req.user.id) });

    if (!user) {
      return sendError(res, 404, 'User not found.');
    }

    return res.status(200).json({
      success: true,
      message: 'User profile fetched successfully',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: user.role
      }
    });

  } catch (err) {
    // Handle invalid ObjectId format or other database exceptions
    if (err.name === 'BSONError' || err.message.includes('Argument passed in must be a single String')) {
      return sendError(res, 400, 'Invalid user ID.');
    }
    console.error('[getMe]', err.message);
    return sendError(res, 500, 'Server error while fetching user profile.');
  }
};

module.exports = { register, login, logout, getMe };
