'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');
const { signToken, attachCookie, clearCookie } = require('../utils/jwt.utils');
const { sendSuccess, sendError } = require('../utils/response.utils');
const {
  GoogleOAuthConfigurationError,
  createGoogleAuthorizationUrl,
  exchangeGoogleAuthorizationCode,
} = require('../services/googleOAuthService');

const GOOGLE_STATE_COOKIE = 'google_oauth_state';
const GOOGLE_STATE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 10 * 60 * 1000,
  path: '/api/auth/google',
};

const getClientUrl = () => process.env.CLIENT_URL?.trim() || 'http://localhost:3000';

const redirectGoogleResult = (res, params) => {
  const target = new URL('/auth/google/callback', getClientUrl());
  Object.entries(params).forEach(([key, value]) => target.searchParams.set(key, value));
  return res.redirect(target.toString());
};

const clearGoogleStateCookie = (res) => {
  res.clearCookie(GOOGLE_STATE_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth/google',
  });
};

const stateMatches = (expected, received) => {
  if (!expected || !received) return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
};

const completeLogin = (res, user, message) => {
  const token = signToken({
    id: user._id,
    email: user.email,
    role: user.role,
  });
  attachCookie(res, token);

  const { password: _, ...userWithoutPassword } = user;
  return sendSuccess(res, 200, message, {
    token,
    user: userWithoutPassword,
  });
};

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
    const isMatch = typeof user.password === 'string'
      && await bcrypt.compare(password, user.password);
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
const demoLogin = async (req, res) => {
  try {
    if (process.env.DEMO_LOGIN_ENABLED !== 'true') {
      return sendError(res, 503, 'Demo login is currently unavailable.');
    }

    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) {
      return sendError(res, 400, 'Demo role must be either user or admin.');
    }

    const prefix = role === 'admin' ? 'DEMO_ADMIN' : 'DEMO_USER';
    const email = process.env[`${prefix}_EMAIL`];
    const password = process.env[`${prefix}_PASSWORD`];
    if (!email || !password) {
      return sendError(res, 503, 'Demo login is not configured.');
    }

    const user = await getDB().collection('users').findOne({
      email: email.trim().toLowerCase(),
    });
    const passwordMatches = user && await bcrypt.compare(password, user.password);
    if (!passwordMatches || user.role !== role) {
      return sendError(res, 503, 'Demo account is not available.');
    }

    const label = role === 'admin' ? 'Demo admin' : 'Demo user';
    return completeLogin(res, user, `${label} logged in successfully.`);
  } catch (err) {
    console.error('[demoLogin]', err.message);
    return sendError(res, 500, 'Server error during demo login.');
  }
};

const startGoogleAuth = (req, res) => {
  try {
    const state = crypto.randomBytes(32).toString('hex');
    const authorizationUrl = createGoogleAuthorizationUrl(state);
    res.cookie(GOOGLE_STATE_COOKIE, state, GOOGLE_STATE_COOKIE_OPTIONS);
    return res.redirect(authorizationUrl);
  } catch (error) {
    if (error instanceof GoogleOAuthConfigurationError) {
      return redirectGoogleResult(res, { error: error.code });
    }
    console.error('[startGoogleAuth]', error.message);
    return redirectGoogleResult(res, { error: 'GOOGLE_OAUTH_START_FAILED' });
  }
};

const googleAuthCallback = async (req, res) => {
  const expectedState = req.cookies?.[GOOGLE_STATE_COOKIE];
  clearGoogleStateCookie(res);

  try {
    if (req.query.error) {
      return redirectGoogleResult(res, { error: 'GOOGLE_ACCESS_DENIED' });
    }
    if (!stateMatches(expectedState, req.query.state)) {
      return redirectGoogleResult(res, { error: 'GOOGLE_INVALID_STATE' });
    }
    if (typeof req.query.code !== 'string' || !req.query.code) {
      return redirectGoogleResult(res, { error: 'GOOGLE_CODE_MISSING' });
    }

    const profile = await exchangeGoogleAuthorizationCode(req.query.code);
    const googleId = profile?.sub?.trim();
    const email = profile?.email?.trim().toLowerCase();

    if (!googleId || !email || profile.email_verified !== true) {
      return redirectGoogleResult(res, { error: 'GOOGLE_PROFILE_INVALID' });
    }

    const users = getDB().collection('users');
    let user = await users.findOne({ googleId });
    if (!user) user = await users.findOne({ email });

    if (user) {
      const update = {
        googleId,
        emailVerified: true,
        updatedAt: new Date(),
      };
      if (!user.name && profile.name) update.name = profile.name.trim();
      if (!user.image && profile.picture) update.image = profile.picture;

      await users.updateOne(
        { _id: user._id },
        {
          $set: update,
          $addToSet: { authProviders: 'google' },
        }
      );
      user = await users.findOne({ _id: user._id });
    } else {
      const newUser = {
        name: profile.name?.trim() || email.split('@')[0],
        email,
        image: profile.picture || null,
        googleId,
        emailVerified: true,
        authProviders: ['google'],
        role: 'user',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const insertResult = await users.insertOne(newUser);
      user = { _id: insertResult.insertedId, ...newUser };
    }

    const token = signToken({ id: user._id, email: user.email, role: user.role });
    attachCookie(res, token);
    return redirectGoogleResult(res, { success: 'true' });
  } catch (error) {
    if (error instanceof GoogleOAuthConfigurationError) {
      return redirectGoogleResult(res, { error: error.code });
    }
    if (error?.code === 11000) {
      return redirectGoogleResult(res, { error: 'GOOGLE_ACCOUNT_CONFLICT' });
    }
    console.error('[googleAuthCallback]', error.message);
    return redirectGoogleResult(res, { error: 'GOOGLE_AUTH_FAILED' });
  }
};

const logout = async (req, res) => {
  try {
    clearCookie(res);
    clearGoogleStateCookie(res);
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

module.exports = {
  register,
  login,
  demoLogin,
  startGoogleAuth,
  googleAuthCallback,
  logout,
  getMe,
};
