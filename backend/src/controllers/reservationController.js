const Reservation = require('../models/Reservation');
const Slot = require('../models/Slot');
const Lot = require('../models/Lot');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const withLock = require('../utils/lock');
const events = require('../utils/events');
const { calculateFee } = require('../utils/fee');
const { blockingFilter } = require('../services/availability');
const { assertId, parseDate, getPaging, pageMeta } = require('../utils/validate');

const MAX_HOURS = 24;
const populateRes = (q) => q.populate('lot', 'name city ratePerHour').populate('slot', 'number type').populate('user', 'name email');

// Driver who owns the booking, the lot's manager, or an admin.
async function loadForActor(req, { allowOwner = true } = {}) {
  assertId(req.params.id, 'reservation id');
  const reservation = await Reservation.findById(req.params.id);
  if (!reservation) throw new AppError('Reservation not found', 404);
  const lot = await Lot.findById(reservation.lot);
  const isOwner = allowOwner && String(reservation.user) === String(req.user._id);
  const isManager = req.user.role === 'admin' || (lot && String(lot.manager) === String(req.user._id));
  if (!isOwner && !isManager) throw new AppError('You are not allowed to change this reservation', 403);
  return { reservation, lot, isManager };
}

exports.createReservation = asyncHandler(async (req, res) => {
  const { slotId, vehicleNumber } = req.body || {};
  assertId(slotId, 'slot id');
  const startTime = parseDate(req.body.startTime, 'startTime');
  const endTime = parseDate(req.body.endTime, 'endTime');

  if (endTime <= startTime) throw new AppError('End time must be after start time', 400);
  if (startTime < new Date(Date.now() - 5 * 60000)) throw new AppError('Start time cannot be in the past', 400);
  if ((endTime - startTime) / 3600000 > MAX_HOURS) throw new AppError(`A booking cannot be longer than ${MAX_HOURS} hours`, 400);

  const slot = await Slot.findById(slotId);
  if (!slot || !slot.isActive) throw new AppError('Slot not found', 404);
  const lot = await Lot.findById(slot.lot);
  if (!lot || !lot.isActive) throw new AppError('This parking lot is not accepting bookings', 400);

  // Only one booking at a time may pass the overlap check for the same slot.
  const reservation = await withLock(`slot:${slot._id}`, async () => {
    const clash = await Reservation.exists({ slot: slot._id, ...blockingFilter(startTime, endTime) });
    if (clash) throw new AppError('This slot is already booked for the selected time', 409);

    const plate = String(vehicleNumber || '').trim().toUpperCase();
    if (plate) {
      const sameVehicle = await Reservation.exists({ vehicleNumber: plate, ...blockingFilter(startTime, endTime) });
      if (sameVehicle) throw new AppError('This vehicle already has a booking in that time window', 409);
    }
    return Reservation.create({ user: req.user._id, lot: lot._id, slot: slot._id, vehicleNumber, startTime, endTime });
  });

  events.emit('lot:changed', String(lot._id));
  const populated = await populateRes(Reservation.findById(reservation._id));
  res.status(201).json({ success: true, message: 'Slot reserved', data: populated });
});

exports.myReservations = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPaging(req.query, 10);
  const filter = { user: req.user._id };
  if (req.query.status) filter.status = req.query.status;
  const [data, total] = await Promise.all([
    populateRes(Reservation.find(filter).sort({ startTime: -1 }).skip(skip).limit(limit)),
    Reservation.countDocuments(filter),
  ]);
  res.json({ success: true, data, ...pageMeta(total, page, limit) });
});

// Manager view: bookings in the manager's lots (admin sees every lot).
exports.lotReservations = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPaging(req.query, 10);
  const filter = {};
  if (req.user.role !== 'admin') {
    const ids = await Lot.find({ manager: req.user._id }).distinct('_id');
    filter.lot = { $in: ids };
  }
  if (req.query.lotId) {
    assertId(req.query.lotId, 'lotId');
    if (filter.lot && !filter.lot.$in.some((id) => String(id) === req.query.lotId)) throw new AppError('Not your lot', 403);
    filter.lot = req.query.lotId;
  }
  if (req.query.status) filter.status = req.query.status;
  if (req.query.date) {
    const day = parseDate(req.query.date, 'date');
    const from = new Date(day); from.setHours(0, 0, 0, 0);
    const to = new Date(from); to.setDate(to.getDate() + 1);
    filter.startTime = { $gte: from, $lt: to };
  }
  const [data, total] = await Promise.all([
    populateRes(Reservation.find(filter).sort({ startTime: -1 }).skip(skip).limit(limit)),
    Reservation.countDocuments(filter),
  ]);
  res.json({ success: true, data, ...pageMeta(total, page, limit) });
});

exports.getReservation = asyncHandler(async (req, res) => {
  const { reservation } = await loadForActor(req);
  res.json({ success: true, data: await populateRes(Reservation.findById(reservation._id)) });
});

exports.cancelReservation = asyncHandler(async (req, res) => {
  const { reservation } = await loadForActor(req);
  if (reservation.status !== 'reserved') throw new AppError(`Only reserved bookings can be cancelled (this one is ${reservation.status})`, 409);
  reservation.status = 'cancelled';
  await reservation.save();
  events.emit('lot:changed', String(reservation.lot));
  res.json({ success: true, message: 'Reservation cancelled', data: reservation });
});

// Car enters: allowed from 15 minutes before the booked start until the booked end.
exports.checkIn = asyncHandler(async (req, res) => {
  const { reservation } = await loadForActor(req);
  if (reservation.status !== 'reserved') throw new AppError(`Cannot check in a ${reservation.status} reservation`, 409);
  const now = new Date();
  if (now < new Date(reservation.startTime.getTime() - 15 * 60000)) throw new AppError('Too early: check-in opens 15 minutes before the start time', 400);
  if (now > reservation.endTime) throw new AppError('This reservation has already ended', 400);
  reservation.status = 'active';
  reservation.entryTime = now;
  await reservation.save();
  events.emit('lot:changed', String(reservation.lot));
  res.json({ success: true, message: 'Checked in', data: reservation });
});

// Car leaves: fee is calculated from the real entry and exit time.
exports.checkOut = asyncHandler(async (req, res) => {
  const { reservation, lot } = await loadForActor(req);
  if (reservation.status !== 'active') throw new AppError('Only active (checked-in) reservations can be checked out', 409);
  const exitTime = new Date();
  const { hours, amount } = calculateFee(reservation.entryTime, exitTime, lot.ratePerHour);
  reservation.status = 'completed';
  reservation.exitTime = exitTime;
  reservation.billedHours = hours;
  reservation.fee = amount;
  await reservation.save();
  events.emit('lot:changed', String(reservation.lot));
  res.json({ success: true, message: `Checked out. Fee: ${amount} for ${hours} hour(s)`, data: reservation });
});
