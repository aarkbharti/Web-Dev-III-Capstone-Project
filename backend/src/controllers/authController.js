const User = require('../models/User');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { signAccessToken, signRefreshToken, verifyRefreshToken, hashToken } = require('../utils/tokens');

const MAX_SESSIONS = 5;

// Creates a token pair and stores the hash of the refresh token on the user.
async function issueTokens(user, replaceHash) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  let hashes = (user.refreshTokenHashes || []).filter((h) => h !== replaceHash);
  hashes.push(hashToken(refreshToken));
  user.refreshTokenHashes = hashes.slice(-MAX_SESSIONS);
  await user.save();
  return { accessToken, refreshToken };
}

exports.register = asyncHandler(async (req, res) => {
  const { name, email, password, phone, role } = req.body || {};
  // Anyone can register as a driver or a lot manager. Admins are created by the seed script only.
  if (role && !['driver', 'manager'].includes(role)) throw new AppError('Role must be driver or manager', 400);
  const user = await User.create({ name, email, password, phone, role: role || 'driver' });
  const tokens = await issueTokens(user);
  res.status(201).json({ success: true, message: 'Registered successfully', user, ...tokens });
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) throw new AppError('Email and password are required', 400);
  const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select('+password +refreshTokenHashes');
  if (!user || !(await user.comparePassword(password))) throw new AppError('Invalid email or password', 401);
  if (!user.isActive) throw new AppError('This account has been blocked', 403);
  const tokens = await issueTokens(user);
  res.json({ success: true, message: 'Login successful', user, ...tokens });
});

exports.refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) throw new AppError('Refresh token is required', 400);
  const payload = verifyRefreshToken(refreshToken);
  const user = await User.findById(payload.id).select('+refreshTokenHashes');
  if (!user || !user.isActive) throw new AppError('Invalid refresh token', 401);
  const hash = hashToken(refreshToken);
  if (!user.refreshTokenHashes.includes(hash)) {
    // A valid token that is no longer stored means it was already used: treat it as theft and end all sessions.
    user.refreshTokenHashes = [];
    await user.save();
    throw new AppError('Refresh token was already used. Please log in again', 401);
  }
  const tokens = await issueTokens(user, hash); // rotation: old token is replaced
  res.json({ success: true, ...tokens });
});

exports.logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body || {};
  if (refreshToken) {
    try {
      const payload = verifyRefreshToken(refreshToken);
      await User.updateOne({ _id: payload.id }, { $pull: { refreshTokenHashes: hashToken(refreshToken) } });
    } catch { /* an expired or bad token means there is nothing to revoke */ }
  }
  res.json({ success: true, message: 'Logged out' });
});

exports.me = asyncHandler(async (req, res) => {
  res.json({ success: true, user: req.user });
});
