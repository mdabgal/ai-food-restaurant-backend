'use strict';

const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');

const buildUserReferenceFilter = (userId, fields) => {
  const objectId = new ObjectId(userId);
  return {
    $or: fields.map((field) => ({ [field]: { $in: [objectId, String(userId)] } })),
  };
};

const toActivity = (type, item, title, description) => ({
  _id: `${type}-${item._id}`,
  type,
  title,
  description,
  createdAt: item.updatedAt || item.createdAt || null,
});

const buildAnalytics = async (currentUserId = null) => {
  const db = getDB();
  const users = db.collection('users');
  const foods = db.collection('foods');
  const orders = db.collection('orders');

  const myFilter = currentUserId ? { createdBy: new ObjectId(currentUserId) } : {};
  const [
    totalUsers,
    totalAdmins,
    totalFoods,
    totalOrders,
    myItems,
    categoryBreakdown,
    monthlyFoods,
    orderSummary,
    foodAverages,
  ] = await Promise.all([
    users.countDocuments({ role: 'user' }),
    users.countDocuments({ role: 'admin' }),
    foods.countDocuments(),
    orders.countDocuments(),
    currentUserId ? foods.countDocuments(myFilter) : Promise.resolve(0),
    foods.aggregate([
      { $group: { _id: { $ifNull: ['$category', 'uncategorized'] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $project: { _id: 0, category: '$_id', count: 1 } },
    ]).toArray(),
    foods.aggregate([
      { $match: { createdAt: { $type: 'date' } } },
      { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
      { $limit: 12 },
      { $project: { _id: 0, year: '$_id.year', month: '$_id.month', count: 1 } },
    ]).toArray(),
    orders.aggregate([
      { $group: { _id: null, revenue: { $sum: { $ifNull: ['$total', 0] } }, averageOrderValue: { $avg: { $ifNull: ['$total', 0] } } } },
      { $project: { _id: 0, revenue: 1, averageOrderValue: 1 } },
    ]).toArray(),
    foods.aggregate([
      { $group: { _id: null, averagePrice: { $avg: '$price' }, averageRating: { $avg: '$rating' } } },
      { $project: { _id: 0, averagePrice: 1, averageRating: 1 } },
    ]).toArray(),
  ]);

  return {
    totalUsers,
    totalAdmins,
    totalAccounts: totalUsers + totalAdmins,
    totalFoods,
    totalItems: totalFoods,
    totalOrders,
    myItems,
    totalRevenue: orderSummary[0]?.revenue || 0,
    averageOrderValue: orderSummary[0]?.averageOrderValue || 0,
    averagePrice: foodAverages[0]?.averagePrice || 0,
    averageRating: foodAverages[0]?.averageRating || 0,
    charts: {
      usersByRole: [
        { role: 'admin', count: totalAdmins },
        { role: 'user', count: totalUsers },
      ],
      itemsByCategory: categoryBreakdown,
      itemsOverTime: monthlyFoods.map((entry) => ({
        period: `${entry.year}-${String(entry.month).padStart(2, '0')}`,
        count: entry.count,
      })),
    },
  };
};

const getPublicAnalytics = async (req, res) => {
  try {
    const data = await buildAnalytics();
    return res.status(200).json({
      success: true,
      data: {
        totalFoods: data.totalFoods,
        totalUsers: data.totalAccounts,
        totalOrders: data.totalOrders,
        averageRating: data.averageRating,
        averagePrice: data.averagePrice,
        categories: data.charts.itemsByCategory,
      },
    });
  } catch (err) {
    console.error('[getPublicAnalytics]', err.message);
    return res.status(500).json({ success: false, message: 'Server error while fetching statistics.' });
  }
};

const getAnalytics = async (req, res) => {
  try {
    const data = await buildAnalytics(req.user.id);
    return res.status(200).json({ success: true, message: 'Analytics fetched successfully', data });
  } catch (err) {
    console.error('[getAnalytics]', err.message);
    return res.status(500).json({ success: false, message: 'Server error while fetching analytics.' });
  }
};

const getUserDashboard = async (req, res) => {
  try {
    const db = getDB();
    const collectionNames = new Set(
      (await db.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name)
    );
    const foods = db.collection('foods');
    const foodFilter = buildUserReferenceFilter(req.user.id, ['createdBy']);
    const orderFilter = buildUserReferenceFilter(req.user.id, [
      'userId',
      'user',
      'customerId',
      'createdBy',
      'ownerId',
    ]);
    const reviewFilter = buildUserReferenceFilter(req.user.id, [
      'userId',
      'user',
      'authorId',
      'createdBy',
      'reviewerId',
    ]);
    const orders = collectionNames.has('orders') ? db.collection('orders') : null;
    const reviews = collectionNames.has('reviews') ? db.collection('reviews') : null;

    const [
      foodSummary,
      recentFoods,
      foodsByCategory,
      foodsOverTime,
      totalOrders,
      recentOrders,
      totalReviews,
      recentReviews,
    ] = await Promise.all([
      foods.aggregate([
        { $match: foodFilter },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            available: {
              $sum: {
                $cond: [{ $in: [{ $ifNull: ['$status', 'available'] }, ['available', 'limited']] }, 1, 0],
              },
            },
            averageRating: { $avg: { $ifNull: ['$rating', 0] } },
            totalValue: { $sum: { $ifNull: ['$price', 0] } },
          },
        },
      ]).toArray(),
      foods.find(foodFilter)
        .project({ name: 1, image: 1, category: 1, price: 1, rating: 1, status: 1, createdAt: 1, updatedAt: 1 })
        .sort({ createdAt: -1, _id: -1 })
        .limit(5)
        .toArray(),
      foods.aggregate([
        { $match: foodFilter },
        { $group: { _id: { $ifNull: ['$category', 'uncategorized'] }, count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $project: { _id: 0, category: '$_id', count: 1 } },
      ]).toArray(),
      foods.aggregate([
        { $match: { ...foodFilter, createdAt: { $type: 'date' } } },
        {
          $group: {
            _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
        { $limit: 12 },
        {
          $project: {
            _id: 0,
            period: {
              $concat: [
                { $toString: '$_id.year' },
                '-',
                {
                  $cond: [
                    { $lt: ['$_id.month', 10] },
                    { $concat: ['0', { $toString: '$_id.month' }] },
                    { $toString: '$_id.month' },
                  ],
                },
              ],
            },
            count: 1,
          },
        },
      ]).toArray(),
      orders ? orders.countDocuments(orderFilter) : Promise.resolve(0),
      orders
        ? orders.find(orderFilter)
          .project({ status: 1, total: 1, createdAt: 1, updatedAt: 1 })
          .sort({ createdAt: -1, _id: -1 })
          .limit(5)
          .toArray()
        : Promise.resolve([]),
      reviews ? reviews.countDocuments(reviewFilter) : Promise.resolve(0),
      reviews
        ? reviews.find(reviewFilter)
          .project({ rating: 1, comment: 1, foodName: 1, createdAt: 1, updatedAt: 1 })
          .sort({ createdAt: -1, _id: -1 })
          .limit(5)
          .toArray()
        : Promise.resolve([]),
    ]);

    const summary = foodSummary[0] || {};
    const activities = [
      ...recentFoods.map((food) => {
        const wasUpdated = food.updatedAt && food.createdAt
          && new Date(food.updatedAt).getTime() > new Date(food.createdAt).getTime();
        return toActivity(
          'food',
          food,
          wasUpdated ? 'Food updated' : 'Food added',
          food.name
        );
      }),
      ...recentOrders.map((order) => toActivity(
        'order',
        order,
        'Order activity',
        order.status ? `Order status: ${order.status}` : 'Order placed'
      )),
      ...recentReviews.map((review) => toActivity(
        'review',
        review,
        'Review submitted',
        review.foodName || (review.rating ? `${review.rating}/5 rating` : 'Food review')
      )),
    ]
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 8);

    return res.status(200).json({
      success: true,
      message: 'User dashboard fetched successfully',
      data: {
        totalMyFoods: summary.total || 0,
        totalOrders,
        totalReviews,
        availableFoods: summary.available || 0,
        averageFoodRating: summary.averageRating || 0,
        totalFoodValue: summary.totalValue || 0,
        recentFoods,
        recentActivity: activities,
        charts: {
          itemsByCategory: foodsByCategory,
          itemsOverTime: foodsOverTime,
          activityByType: [
            { type: 'Foods', count: summary.total || 0 },
            { type: 'Orders', count: totalOrders },
            { type: 'Reviews', count: totalReviews },
          ],
        },
      },
    });
  } catch (err) {
    console.error('[getUserDashboard]', err.message);
    return res.status(500).json({ success: false, message: 'Server error while fetching the user dashboard.' });
  }
};

module.exports = { getAnalytics, getPublicAnalytics, getUserDashboard };
