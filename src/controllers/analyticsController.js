'use strict';

const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');

// ─── GET /api/analytics (Protected: Admin Only) ──────────────────────────────────
const getAnalytics = async (req, res) => {
  try {
    const db = getDB();
    const usersCol = db.collection('users');
    const itemsCol = db.collection('items');

    const adminId = new ObjectId(req.user.id);

    // Fetch counts in parallel for optimal database performance
    const [
      totalUsers,
      totalAdmins,
      totalItems,
      myItems
    ] = await Promise.all([
      usersCol.countDocuments({ role: 'user' }),
      usersCol.countDocuments({ role: 'admin' }),
      itemsCol.countDocuments({}),
      itemsCol.countDocuments({ createdBy: adminId })
    ]);

    // Format chart data structures for direct Recharts compatibility
    const charts = {
      usersByRole: [
        { role: 'admin', count: totalAdmins },
        { role: 'user', count: totalUsers }
      ],
      itemsOverview: [
        { name: 'Items', value: totalItems }
      ]
    };

    return res.status(200).json({
      success: true,
      message: 'Analytics fetched successfully',
      data: {
        totalUsers,
        totalAdmins,
        totalItems,
        myItems,
        charts
      }
    });

  } catch (err) {
    console.error('[getAnalytics]', err.message);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching analytics.'
    });
  }
};

module.exports = {
  getAnalytics
};
