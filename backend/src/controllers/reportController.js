const mongoose = require('mongoose');
const Lot = require('../models/Lot');
const Slot = require('../models/Slot');
const Reservation = require('../models/Reservation');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { assertId, parseDate } = require('../utils/validate');

const DAY = 86400000;

// Works out the lots and date range a report should cover, based on who is asking.
async function reportScope(req) {
  const to = req.query.to ? parseDate(req.query.to, 'to') : new Date();
  const from = req.query.from ? parseDate(req.query.from, 'from') : new Date(to.getTime() - 30 * DAY);
  if (from >= to) throw new AppError('"from" must be before "to"', 400);

  const lotFilter = req.user.role === 'admin' ? {} : { manager: req.user._id };
  if (req.query.lotId) {
    assertId(req.query.lotId, 'lotId');
    lotFilter._id = req.query.lotId;
  }
  const lots = await Lot.find(lotFilter, '_id name');
  if (req.query.lotId && lots.length === 0) throw new AppError('Lot not found or not yours', 404);
  return { from, to, lotIds: lots.map((l) => l._id) };
}

// Occupancy report: bookings, cancellation rate, booked hours and occupancy % per lot.
exports.occupancy = asyncHandler(async (req, res) => {
  const { from, to, lotIds } = await reportScope(req);
  const rangeHours = (to - from) / 3600000;

  const [perLot, slotCounts] = await Promise.all([
    Reservation.aggregate([
      { $match: { lot: { $in: lotIds }, startTime: { $gte: from, $lt: to } } },
      {
        $group: {
          _id: '$lot',
          bookings: { $sum: 1 },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          bookedHours: {
            $sum: { $cond: [{ $ne: ['$status', 'cancelled'] }, { $divide: [{ $subtract: ['$endTime', '$startTime'] }, 3600000] }, 0] },
          },
        },
      },
      { $lookup: { from: 'lots', localField: '_id', foreignField: '_id', as: 'lot' } },
      { $unwind: '$lot' },
      { $project: { _id: 0, lotId: '$_id', lotName: '$lot.name', bookings: 1, cancelled: 1, completed: 1, bookedHours: { $round: ['$bookedHours', 1] } } },
    ]),
    Slot.aggregate([{ $match: { lot: { $in: lotIds }, isActive: true } }, { $group: { _id: '$lot', slots: { $sum: 1 } } }]),
  ]);

  const slotMap = Object.fromEntries(slotCounts.map((s) => [String(s._id), s.slots]));
  const byId = Object.fromEntries(perLot.map((r) => [String(r.lotId), r]));
  const lots = await Lot.find({ _id: { $in: lotIds } }, 'name');
  const data = lots.map((l) => {
    const r = byId[String(l._id)] || { lotId: l._id, lotName: l.name, bookings: 0, cancelled: 0, completed: 0, bookedHours: 0 };
    const slots = slotMap[String(l._id)] || 0;
    const capacityHours = slots * rangeHours;
    return {
      ...r,
      slots,
      cancellationRate: r.bookings ? Math.round((r.cancelled / r.bookings) * 1000) / 10 : 0,
      occupancyRate: capacityHours ? Math.min(100, Math.round((r.bookedHours / capacityHours) * 1000) / 10) : 0,
    };
  });
  res.json({ success: true, range: { from, to }, data });
});

// Revenue report using $facet: totals, per-day and per-lot revenue from completed stays.
exports.revenue = asyncHandler(async (req, res) => {
  const { from, to, lotIds } = await reportScope(req);
  const [result] = await Reservation.aggregate([
    { $match: { lot: { $in: lotIds }, status: 'completed', exitTime: { $gte: from, $lt: to } } },
    {
      $facet: {
        totals: [{ $group: { _id: null, revenue: { $sum: '$fee' }, stays: { $sum: 1 }, avgFee: { $avg: '$fee' }, hours: { $sum: '$billedHours' } } }],
        daily: [
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$exitTime' } }, revenue: { $sum: '$fee' }, stays: { $sum: 1 } } },
          { $sort: { _id: 1 } },
          { $project: { _id: 0, date: '$_id', revenue: 1, stays: 1 } },
        ],
        byLot: [
          { $group: { _id: '$lot', revenue: { $sum: '$fee' }, stays: { $sum: 1 } } },
          { $lookup: { from: 'lots', localField: '_id', foreignField: '_id', as: 'lot' } },
          { $unwind: '$lot' },
          { $sort: { revenue: -1 } },
          { $project: { _id: 0, lotId: '$_id', lotName: '$lot.name', revenue: 1, stays: 1 } },
        ],
      },
    },
  ]);
  const totals = result.totals[0] || { revenue: 0, stays: 0, avgFee: 0, hours: 0 };
  res.json({
    success: true,
    range: { from, to },
    totals: { revenue: totals.revenue, stays: totals.stays, hours: totals.hours, avgFee: Math.round(totals.avgFee * 100) / 100 },
    daily: result.daily,
    byLot: result.byLot,
  });
});

// Which hours of the day are busiest (by booking start time).
exports.peakHours = asyncHandler(async (req, res) => {
  const { from, to, lotIds } = await reportScope(req);
  const rows = await Reservation.aggregate([
    { $match: { lot: { $in: lotIds }, status: { $ne: 'cancelled' }, startTime: { $gte: from, $lt: to } } },
    { $group: { _id: { $hour: '$startTime' }, bookings: { $sum: 1 } } },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, hour: '$_id', bookings: 1 } },
  ]);
  const byHour = Object.fromEntries(rows.map((r) => [r.hour, r.bookings]));
  res.json({ success: true, range: { from, to }, data: Array.from({ length: 24 }, (_, h) => ({ hour: h, bookings: byHour[h] || 0 })) });
});
