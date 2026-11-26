const Lot = require('../models/Lot');
const Slot = require('../models/Slot');
const Reservation = require('../models/Reservation');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { assertId, parseDate, getPaging, pageMeta } = require('../utils/validate');
const { getLotAvailability, getBusySlotIds } = require('../services/availability');

const isOwnerOrAdmin = (user, lot) => user.role === 'admin' || String(lot.manager) === String(user._id);

async function withAvailability(lots) {
  const stats = await getLotAvailability(lots.map((l) => l._id));
  return lots.map((l) => ({ ...l.toObject(), availability: stats[String(l._id)] }));
}

exports.listLots = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPaging(req.query, 9);
  const filter = { isActive: true };
  if (req.query.city) filter.city = new RegExp(`^${String(req.query.city).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  if (req.query.q) {
    const q = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: q }, { address: q }];
  }
  const [lots, total] = await Promise.all([
    Lot.find(filter).populate('manager', 'name').sort({ name: 1 }).skip(skip).limit(limit),
    Lot.countDocuments(filter),
  ]);
  res.json({ success: true, data: await withAvailability(lots), ...pageMeta(total, page, limit) });
});

// Lots that the logged-in manager owns (admins see all lots).
exports.myLots = asyncHandler(async (req, res) => {
  const filter = req.user.role === 'admin' ? {} : { manager: req.user._id };
  const lots = await Lot.find(filter).populate('manager', 'name email').sort({ createdAt: -1 });
  res.json({ success: true, data: await withAvailability(lots) });
});

exports.getLot = asyncHandler(async (req, res) => {
  assertId(req.params.id, 'lot id');
  const lot = await Lot.findById(req.params.id).populate('manager', 'name');
  if (!lot) throw new AppError('Lot not found', 404);
  const [lotWithStats] = await withAvailability([lot]);
  res.json({ success: true, data: lotWithStats });
});

exports.createLot = asyncHandler(async (req, res) => {
  const { name, address, city, ratePerHour, managerId } = req.body || {};
  const manager = req.user.role === 'admin' && managerId ? managerId : req.user._id;
  const lot = await Lot.create({ name, address, city, ratePerHour, manager });
  res.status(201).json({ success: true, message: 'Parking lot created', data: lot });
});

exports.updateLot = asyncHandler(async (req, res) => {
  assertId(req.params.id, 'lot id');
  const lot = await Lot.findById(req.params.id);
  if (!lot) throw new AppError('Lot not found', 404);
  if (!isOwnerOrAdmin(req.user, lot)) throw new AppError('You can only edit your own lots', 403);
  ['name', 'address', 'city', 'ratePerHour', 'isActive'].forEach((f) => {
    if (req.body[f] !== undefined) lot[f] = req.body[f];
  });
  await lot.save();
  res.json({ success: true, message: 'Parking lot updated', data: lot });
});

exports.deleteLot = asyncHandler(async (req, res) => {
  assertId(req.params.id, 'lot id');
  const lot = await Lot.findById(req.params.id);
  if (!lot) throw new AppError('Lot not found', 404);
  if (!isOwnerOrAdmin(req.user, lot)) throw new AppError('You can only delete your own lots', 403);
  const open = await Reservation.countDocuments({ lot: lot._id, status: { $in: ['reserved', 'active'] } });
  if (open > 0) throw new AppError('Cannot delete a lot that still has reserved or active bookings', 409);
  await Slot.deleteMany({ lot: lot._id });
  await lot.deleteOne();
  res.json({ success: true, message: 'Parking lot deleted' });
});

// Slots of a lot, each flagged as available or taken for the requested window.
exports.listSlots = asyncHandler(async (req, res) => {
  assertId(req.params.id, 'lot id');
  const lot = await Lot.findById(req.params.id);
  if (!lot) throw new AppError('Lot not found', 404);
  const start = req.query.start ? parseDate(req.query.start, 'start') : new Date();
  const end = req.query.end ? parseDate(req.query.end, 'end') : new Date(start.getTime() + 3600000);
  if (end <= start) throw new AppError('end must be after start', 400);
  const filter = { lot: lot._id, isActive: true };
  if (req.query.type) filter.type = req.query.type;
  const slots = await Slot.find(filter).sort({ number: 1 }).collation({ locale: 'en', numericOrdering: true });
  const busy = await getBusySlotIds({ lot: lot._id }, start, end);
  res.json({
    success: true,
    window: { start, end },
    data: slots.map((s) => ({ ...s.toObject(), available: !busy.has(String(s._id)) })),
  });
});

// Add one slot ({ number }) or many ({ prefix, count }) to a lot.
exports.addSlots = asyncHandler(async (req, res) => {
  assertId(req.params.id, 'lot id');
  const lot = await Lot.findById(req.params.id);
  if (!lot) throw new AppError('Lot not found', 404);
  if (!isOwnerOrAdmin(req.user, lot)) throw new AppError('You can only add slots to your own lots', 403);
  const { number, prefix = 'A', count, type = 'car' } = req.body || {};

  let numbers;
  if (count !== undefined) {
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1 || n > 200) throw new AppError('count must be a whole number between 1 and 200', 400);
    numbers = Array.from({ length: n }, (_, i) => `${String(prefix).trim().toUpperCase()}${i + 1}`);
  } else if (number) {
    numbers = [String(number).trim().toUpperCase()];
  } else {
    throw new AppError('Provide either "number" or "prefix" with "count"', 400);
  }

  const existing = new Set((await Slot.find({ lot: lot._id, number: { $in: numbers } }, 'number')).map((s) => s.number));
  const fresh = numbers.filter((n) => !existing.has(n));
  const created = fresh.length ? await Slot.insertMany(fresh.map((n) => ({ lot: lot._id, number: n, type }))) : [];
  if (created.length === 0) throw new AppError('Those slot numbers already exist in this lot', 409);
  require('../utils/events').emit('lot:changed', String(lot._id));
  res.status(201).json({ success: true, message: `${created.length} slot(s) added`, skipped: existing.size, data: created });
});

exports.deleteSlot = asyncHandler(async (req, res) => {
  assertId(req.params.id, 'slot id');
  const slot = await Slot.findById(req.params.id);
  if (!slot) throw new AppError('Slot not found', 404);
  const lot = await Lot.findById(slot.lot);
  if (!lot || !isOwnerOrAdmin(req.user, lot)) throw new AppError('You can only remove slots from your own lots', 403);
  const open = await Reservation.countDocuments({ slot: slot._id, status: { $in: ['reserved', 'active'] } });
  if (open > 0) throw new AppError('Slot has reserved or active bookings', 409);
  await slot.deleteOne();
  require('../utils/events').emit('lot:changed', String(lot._id));
  res.json({ success: true, message: 'Slot removed' });
});
