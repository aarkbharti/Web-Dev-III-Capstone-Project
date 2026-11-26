const User = require('../models/User');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { verifyAccessToken } = require('../utils/tokens');

// Protected route: needs "Authorization: Bearer <access token>"
const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) throw new AppError('Not authenticated: access token missing', 401);
  const payload = verifyAccessToken(header.slice(7)); // JWT errors are translated by the error middleware
  const user = await User.findById(payload.id);
  if (!user) throw new AppError('The user for this token no longer exists', 401);
  if (!user.isActive) throw new AppError('This account has been blocked', 403);
  req.user = user;
  next();
});

// RBAC: only the listed roles may continue.
const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return next(new AppError(`Role "${req.user.role}" is not allowed to do this`, 403));
  }
  next();
};

module.exports = { protect, authorize };
