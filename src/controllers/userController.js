'use strict';

const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');

// Helper to get collection
const getUsersCol = () => getDB().collection('users');

// Helper to check for valid ObjectId
const isValidObjectId = (id) => ObjectId.isValid(id) && String(new ObjectId(id)) === id;

// Helper to send standard error responses
const sendError = (res, status, message, errors = null) => {
  const body = { success: false, message };
  if (errors) body.errors = errors;
  return res.status(status).json(body);
};

// ─── GET /api/users (Protected: Admin Only) ─────────────────────────────────────
const getUsers = async (req, res) => {
  try {
    const usersCol = getUsersCol();
    
    // Fetch all users, excluding the password field, sorted by newest first
    const users = await usersCol
      .find({}, { projection: { password: 0 } })
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      message: 'Users fetched successfully',
      data: users,
    });

  } catch (err) {
    console.error('[getUsers]', err.message);
    return sendError(res, 500, 'Server error while fetching users.');
  }
};

// ─── PATCH /api/users/:id/role (Protected: Admin Only) ───────────────────────────
const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    // Validate ID
    if (!isValidObjectId(id)) {
      return sendError(res, 400, 'Invalid user ID.');
    }

    // Validate role
    if (!role || (role !== 'admin' && role !== 'user')) {
      return sendError(res, 400, 'Invalid role. Only "admin" and "user" are allowed.');
    }

    const usersCol = getUsersCol();
    const userObjectId = new ObjectId(id);

    // Verify user exists before updating
    const existingUser = await usersCol.findOne({ _id: userObjectId });
    if (!existingUser) {
      return sendError(res, 404, 'User not found.');
    }

    // Update role and updatedAt only
    const updatedUser = await usersCol.findOneAndUpdate(
      { _id: userObjectId },
      { $set: { role, updatedAt: new Date() } },
      { returnDocument: 'after', projection: { password: 0 } }
    );

    if (!updatedUser) {
      return sendError(res, 404, 'User not found after update.');
    }

    return res.status(200).json({
      success: true,
      message: 'User role updated successfully',
      data: updatedUser,
    });

  } catch (err) {
    console.error('[updateUserRole]', err.message);
    return sendError(res, 500, 'Server error during user role update.');
  }
};

// PATCH /api/users/:id (Admin or self)
const updateUserProfile = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return sendError(res, 400, 'Invalid user ID.');

    const isSelf = String(req.user.id) === id;
    const isAdmin = req.user.role === 'admin';
    if (!isSelf && !isAdmin) return sendError(res, 403, 'Access denied');

    const update = {};
    if (req.body.name !== undefined) {
      if (typeof req.body.name !== 'string' || !req.body.name.trim()) return sendError(res, 422, 'Name must be a non-empty string.');
      update.name = req.body.name.trim();
    }
    if (req.body.image !== undefined) {
      if (req.body.image !== null && typeof req.body.image !== 'string') return sendError(res, 422, 'Image must be a URL string.');
      update.image = req.body.image?.trim() || null;
    }
    if (!Object.keys(update).length) return sendError(res, 400, 'No valid profile fields provided.');

    const user = await getUsersCol().findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { ...update, updatedAt: new Date() } },
      { returnDocument: 'after', projection: { password: 0 } }
    );
    if (!user) return sendError(res, 404, 'User not found.');
    return res.status(200).json({ success: true, message: 'Profile updated successfully', data: user });
  } catch (err) {
    console.error('[updateUserProfile]', err.message);
    return sendError(res, 500, 'Server error during profile update.');
  }
};

// ─── GET /api/users/:id (Protected: Admin or Self Only) ─────────────────────────
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID
    if (!isValidObjectId(id)) {
      return sendError(res, 400, 'Invalid user ID.');
    }

    // Authorization: Admin can view any user, normal user can only view their own profile
    const isSelf = req.user.id === id;
    const isAdmin = req.user.role === 'admin';

    if (!isSelf && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const usersCol = getUsersCol();
    const user = await usersCol.findOne(
      { _id: new ObjectId(id) },
      { projection: { password: 0 } }
    );

    if (!user) {
      return sendError(res, 404, 'User not found.');
    }

    return res.status(200).json({
      success: true,
      message: 'User fetched successfully',
      data: user,
    });

  } catch (err) {
    console.error('[getUserById]', err.message);
    return sendError(res, 500, 'Server error while fetching user details.');
  }
};

// ─── DELETE /api/users/:id (Protected: Admin Only) ──────────────────────────
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID
    if (!isValidObjectId(id)) {
      return sendError(res, 400, 'Invalid user ID.');
    }

    const usersCol = getUsersCol();
    const userObjectId = new ObjectId(id);

    // Check if user exists
    const existingUser = await usersCol.findOne({ _id: userObjectId });
    if (!existingUser) {
      return sendError(res, 404, 'User not found.');
    }

    // Delete the user
    await usersCol.deleteOne({ _id: userObjectId });

    return res.status(200).json({
      success: true,
      message: 'User deleted successfully',
    });

  } catch (err) {
    console.error('[deleteUser]', err.message);
    return sendError(res, 500, 'Server error while deleting user.');
  }
};

module.exports = {
  getUsers,
  updateUserRole,
  updateUserProfile,
  getUserById,
  deleteUser,
};
