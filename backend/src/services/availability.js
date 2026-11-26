const mongoose = require('mongoose');
const Slot = require('../models/Slot');
const Reservation = require('../models/Reservation');

const oid = (id) => new mongoose.Types.ObjectId(String(id));

// Reservations that block a slot for the window [start, end):
//  - reserved: blocks when its booked window overlaps
//  - active (car is inside): blocks until checkout, so an overstaying car keeps blocking
function blockingFilter(start, end, now = new Date()) {
  return {
    $or: [
      { status: 'reserved', startTime: { $lt: end }, endTime: { $gt: start } },
      { status: 'active', startTime: { $lt: end }, $or: [{ endTime: { $gt: start } }, { endTime: { $lte: now } }] },
    ],
  };
}

// Ids of slots in the given lot(s) that are taken during the window.
async function getBusySlotIds(slotMatch, start, end) {
  const ids = await Reservation.distinct('slot', { ...slotMatch, ...blockingFilter(start, end) });
  return new Set(ids.map(String));
}

// Live numbers for lot cards: total slots and how many are free right now.
async function getLotAvailability(lotIds) {
  const ids = lotIds.map(oid);
  const now = new Date();
  const soon = new Date(now.getTime() + 1000);
  const [totals, busy] = await Promise.all([
    Slot.aggregate([
      { $match: { lot: { $in: ids }, isActive: true } },
      { $group: { _id: '$lot', total: { $sum: 1 } } },
    ]),
    Reservation.aggregate([
      { $match: { lot: { $in: ids }, ...blockingFilter(now, soon, now) } },
      { $group: { _id: { lot: '$lot', slot: '$slot' } } },
      { $group: { _id: '$_id.lot', busy: { $sum: 1 } } },
    ]),
  ]);
  const result = {};
  ids.forEach((id) => (result[String(id)] = { total: 0, busy: 0, available: 0 }));
  totals.forEach((t) => (result[String(t._id)].total = t.total));
  busy.forEach((b) => (result[String(b._id)].busy = b.busy));
  Object.values(result).forEach((r) => (r.available = Math.max(0, r.total - r.busy)));
  return result;
}

module.exports = { blockingFilter, getBusySlotIds, getLotAvailability };
