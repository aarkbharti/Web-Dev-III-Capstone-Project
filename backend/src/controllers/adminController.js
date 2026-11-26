const User = require('../models/User');
const Lot = require('../models/Lot');
const Reservation = require('../models/Reservation');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { assertId, getPaging, pageMeta } = require('../utils/validate');

exports.listUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPaging(req.query, 10);
  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.q) {
    const q = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: q }, { email: q }];
  }
  const [data, total] = await Promise.all([User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit), User.countDocuments(filter)]);
  res.json({ success: true, data, ...pageMeta(total, page, limit) });
});

exports.setUserActive = asyncHandler(async (req, res) => {
  assertId(req.params.id, 'user id');
  const { isActive } = req.body || {};
  if (typeof isActive !== 'boolean') throw new AppError('isActive must be true or false', 400);
  const user = await User.findById(req.params.id).select('+refreshTokenHashes');
  if (!user) throw new AppError('User not found', 404);
  if (String(user._id) === String(req.user._id)) throw new AppError('You cannot block yourself', 400);
  if (user.role === 'admin') throw new AppError('Admin accounts cannot be blocked', 403);
  user.isActive = isActive;
  if (!isActive) user.refreshTokenHashes = []; // blocked users lose their sessions
  await user.save();
  res.json({ success: true, message: isActive ? 'User unblocked' : 'User blocked', data: user });
});

exports.setUserRole = asyncHandler(async (req, res) => {
  assertId(req.params.id, 'user id');
  const { role } = req.body || {};
  if (!['driver', 'manager'].includes(role)) throw new AppError('Role must be driver or manager', 400);
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError('User not found', 404);
  if (user.role === 'admin') throw new AppError('Admin role cannot be changed', 403);
  user.role = role;
  await user.save();
  res.json({ success: true, message: 'Role updated', data: user });
});

// Platform-wide numbers for the admin dashboard.
exports.stats = asyncHandler(async (req, res) => {
  const [usersByRole, reservationsByStatus, lots, revenue] = await Promise.all([
    User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
    Reservation.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Lot.countDocuments(),
    Reservation.aggregate([{ $match: { status: 'completed' } }, { $group: { _id: null, total: { $sum: '$fee' } } }]),
  ]);
  const toMap = (rows) => Object.fromEntries(rows.map((r) => [r._id, r.count]));
  res.json({
    success: true,
    data: { users: toMap(usersByRole), reservations: toMap(reservationsByStatus), lots, totalRevenue: revenue[0]?.total || 0 },
  });
});
