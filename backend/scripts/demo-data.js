// Optional: fills the database with believable bookings so dashboards and reports are not empty.
// Run after "npm run seed".   Usage: node scripts/demo-data.js
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Lot = require('../src/models/Lot');
const Slot = require('../src/models/Slot');
const Reservation = require('../src/models/Reservation');

const H = 3600000;
const plates = ['HR26DK4521', 'DL8CAF3344', 'UP14BX9087', 'HR51AB1200', 'DL3CBT7781', 'PB65AK0099', 'RJ14CD2210', 'MH12QW5566'];

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const driver = await User.findOne({ email: 'driver@parkeasy.com' });
  const lots = await Lot.find({ name: { $in: ['City Center Parking', 'Airport Express Lot', 'Mall Road Basement'] } });
  if (!driver || lots.length === 0) throw new Error('Run "npm run seed" first');
  await Reservation.deleteMany({ user: driver._id });

  const docs = [];
  let n = 0;
  for (const lot of lots) {
    const slots = await Slot.find({ lot: lot._id }).sort({ number: 1 });
    // completed stays over the last 12 days
    for (let day = 12; day >= 1; day--) {
      const stays = 1 + ((day + n) % 4);
      for (let k = 0; k < stays; k++) {
        const slot = slots[(day + k) % slots.length];
        const hoursIn = 7 + ((day * 3 + k * 5) % 12);
        const duration = 1 + ((day + k) % 5);
        const start = new Date(Date.now() - day * 24 * H);
        start.setHours(hoursIn, 0, 0, 0);
        const end = new Date(start.getTime() + duration * H);
        docs.push({ user: driver._id, lot: lot._id, slot: slot._id, vehicleNumber: plates[(day + k) % plates.length], startTime: start, endTime: end, status: 'completed', entryTime: start, exitTime: end, billedHours: duration, fee: duration * lot.ratePerHour });
      }
    }
    // a couple of cancelled ones
    docs.push({ user: driver._id, lot: lot._id, slot: slots[2]._id, vehicleNumber: plates[1], startTime: new Date(Date.now() - 3 * 24 * H), endTime: new Date(Date.now() - 3 * 24 * H + 2 * H), status: 'cancelled' });
    n++;
  }
  await Reservation.insertMany(docs);

  // a few upcoming and currently active bookings
  const city = lots[0];
  const cs = await Slot.find({ lot: city._id }).sort({ number: 1 });
  await Reservation.insertMany([
    { user: driver._id, lot: city._id, slot: cs[0]._id, vehicleNumber: 'HR26DK4521', startTime: new Date(Date.now() - 1 * H), endTime: new Date(Date.now() + 2 * H), status: 'active', entryTime: new Date(Date.now() - 50 * 60000) },
    { user: driver._id, lot: city._id, slot: cs[1]._id, vehicleNumber: 'DL8CAF3344', startTime: new Date(Date.now() + 3 * H), endTime: new Date(Date.now() + 6 * H), status: 'reserved' },
    { user: driver._id, lot: lots[1]._id, slot: (await Slot.findOne({ lot: lots[1]._id }))._id, vehicleNumber: 'UP14BX9087', startTime: new Date(Date.now() + 26 * H), endTime: new Date(Date.now() + 30 * H), status: 'reserved' },
  ]);
  console.log(`Demo data created: ${docs.length + 3} reservations`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
