// Creates the admin account and a small demo dataset.  Usage: npm run seed
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Lot = require('../src/models/Lot');
const Slot = require('../src/models/Slot');
const Reservation = require('../src/models/Reservation');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await Promise.all([User.init(), Lot.init(), Slot.init(), Reservation.init()]);

  const upsert = async (data) => (await User.findOne({ email: data.email })) || User.create(data);
  const admin = await upsert({ name: 'Admin', email: process.env.ADMIN_EMAIL || 'admin@parkeasy.com', password: process.env.ADMIN_PASSWORD || 'Admin@123', role: 'admin' });
  const manager = await upsert({ name: 'Ravi Manager', email: 'manager@parkeasy.com', password: 'Manager@123', role: 'manager', phone: '9876543210' });
  await upsert({ name: 'Demo Driver', email: 'driver@parkeasy.com', password: 'Driver@123', role: 'driver', phone: '9123456780' });

  const lots = [
    { name: 'City Center Parking', address: 'Sector 29, Near Metro Station', city: 'Gurugram', ratePerHour: 40, slots: 12 },
    { name: 'Airport Express Lot', address: 'Terminal 3 Approach Road', city: 'Delhi', ratePerHour: 80, slots: 20 },
    { name: 'Mall Road Basement', address: 'MG Road', city: 'Gurugram', ratePerHour: 30, slots: 8 },
  ];
  for (const l of lots) {
    let lot = await Lot.findOne({ name: l.name });
    if (!lot) {
      lot = await Lot.create({ name: l.name, address: l.address, city: l.city, ratePerHour: l.ratePerHour, manager: manager._id });
      await Slot.insertMany(Array.from({ length: l.slots }, (_, i) => ({ lot: lot._id, number: `A${i + 1}`, type: i % 6 === 5 ? 'ev' : 'car' })));
    }
  }
  console.log('Seed complete.');
  console.log(`  admin   : ${admin.email} / ${process.env.ADMIN_PASSWORD || 'Admin@123'}`);
  console.log('  manager : manager@parkeasy.com / Manager@123');
  console.log('  driver  : driver@parkeasy.com / Driver@123');
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
