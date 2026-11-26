const mongoose = require('mongoose');
const AppError = require('./AppError');

const assertId = (id, label = 'id') => {
  if (!mongoose.isValidObjectId(id)) throw new AppError(`Invalid ${label}`, 400);
};

const parseDate = (value, label) => {
  const d = new Date(value);
  if (!value || Number.isNaN(d.getTime())) throw new AppError(`${label} must be a valid date`, 400);
  return d;
};

// Page/limit parsing shared by every list endpoint.
const getPaging = (query, defaultLimit = 10) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
};

const pageMeta = (total, page, limit) => ({ total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });

module.exports = { assertId, parseDate, getPaging, pageMeta };
