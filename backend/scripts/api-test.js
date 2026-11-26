// End-to-end check of the whole API against a running server (npm start in another terminal).
// Usage: npm run test:api      (needs the seed data: npm run seed)
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const { io } = require('socket.io-client');
const Reservation = require('../src/models/Reservation');

const BASE = `http://localhost:${process.env.PORT || 5000}/api`;
const stamp = Date.now().toString().slice(-6);
const plate = (base) => `${base.slice(0, 6)}${stamp}`; // unique plates so the suite can be run repeatedly
let passed = 0, failed = 0;

async function api(method, path, { body, token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}
const section = (t) => console.log(`\n${t}`);
const hours = (h) => new Date(Date.now() + h * 3600000).toISOString();

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  section('1. Authentication');
  let r = await api('POST', '/auth/register', { body: { name: 'Test Driver', email: `driver${stamp}@test.com`, password: 'secret123', role: 'driver' } });
  check('register driver -> 201', r.status === 201 && r.body.accessToken && r.body.refreshToken);
  check('password is never returned', !JSON.stringify(r.body).includes('secret123') && !r.body.user.password);
  const driver = { token: r.body.accessToken, refresh: r.body.refreshToken, email: `driver${stamp}@test.com` };
  r = await api('POST', '/auth/register', { body: { name: 'Test Driver', email: driver.email, password: 'secret123' } });
  check('duplicate email -> 409', r.status === 409);
  r = await api('POST', '/auth/register', { body: { name: 'X', email: 'bad', password: '1' } });
  check('invalid data -> 400 with messages', r.status === 400 && r.body.details?.length >= 2);
  r = await api('POST', '/auth/register', { body: { name: 'Sneaky', email: `s${stamp}@test.com`, password: 'secret123', role: 'admin' } });
  check('cannot self-register as admin -> 400', r.status === 400);
  r = await api('POST', '/auth/login', { body: { email: driver.email, password: 'wrongpass' } });
  check('wrong password -> 401', r.status === 401);
  r = await api('POST', '/auth/login', { body: { email: 'manager@parkeasy.com', password: 'Manager@123' } });
  check('manager login -> 200', r.status === 200);
  const manager = { token: r.body.accessToken };
  r = await api('POST', '/auth/login', { body: { email: 'admin@parkeasy.com', password: 'Admin@123' } });
  const admin = { token: r.body.accessToken };
  check('admin login -> 200', r.status === 200 && r.body.user.role === 'admin');

  section('2. Tokens: protected route, refresh rotation, reuse detection');
  r = await api('GET', '/auth/me');
  check('no token -> 401', r.status === 401);
  r = await api('GET', '/auth/me', { token: 'abc.def.ghi' });
  check('bad token -> 401', r.status === 401);
  r = await api('GET', '/auth/me', { token: driver.token });
  check('valid token -> 200', r.status === 200 && r.body.user.email === driver.email);
  r = await api('POST', '/auth/refresh', { body: { refreshToken: driver.refresh } });
  check('refresh -> new token pair', r.status === 200 && r.body.refreshToken && r.body.refreshToken !== driver.refresh);
  const oldRefresh = driver.refresh;
  driver.refresh = r.body.refreshToken; driver.token = r.body.accessToken;
  r = await api('POST', '/auth/refresh', { body: { refreshToken: oldRefresh } });
  check('reusing an old refresh token -> 401', r.status === 401);
  r = await api('POST', '/auth/refresh', { body: { refreshToken: driver.refresh } });
  check('reuse ends all sessions (new token also dead) -> 401', r.status === 401);
  r = await api('POST', '/auth/login', { body: { email: driver.email, password: 'secret123' } });
  driver.token = r.body.accessToken; driver.refresh = r.body.refreshToken;

  section('3. RBAC');
  r = await api('POST', '/lots', { token: driver.token, body: { name: 'Nope', address: 'x', city: 'x', ratePerHour: 10 } });
  check('driver cannot create a lot -> 403', r.status === 403);
  r = await api('GET', '/admin/users', { token: manager.token });
  check('manager cannot open admin routes -> 403', r.status === 403);
  r = await api('GET', '/admin/users', { token: admin.token });
  check('admin can list users -> 200', r.status === 200 && r.body.data.length > 0);
  r = await api('GET', '/reports/revenue', { token: driver.token });
  check('driver cannot open reports -> 403', r.status === 403);

  section('4. Lots and slots');
  r = await api('POST', '/lots', { token: manager.token, body: { name: `Test Lot ${stamp}`, address: 'Test Road', city: 'Noida', ratePerHour: 50 } });
  check('manager creates lot -> 201', r.status === 201);
  const lotId = r.body.data._id;
  r = await api('POST', '/lots', { token: manager.token, body: { name: 'A', address: 'x', city: 'x', ratePerHour: 0 } });
  check('lot validation (rate 0) -> 400', r.status === 400);
  r = await api('POST', `/lots/${lotId}/slots`, { token: manager.token, body: { prefix: 'T', count: 4 } });
  check('bulk add 4 slots -> 201', r.status === 201 && r.body.data.length === 4);
  r = await api('POST', `/lots/${lotId}/slots`, { token: manager.token, body: { prefix: 'T', count: 4 } });
  check('duplicate slot numbers -> 409', r.status === 409);
  r = await api('GET', `/lots/${lotId}/slots?start=${hours(1)}&end=${hours(2)}`, { token: driver.token });
  check('driver lists slots with availability', r.status === 200 && r.body.data.length === 4 && r.body.data.every((s) => s.available));
  const slot = r.body.data[0];
  const slot2 = r.body.data[1];
  r = await api('GET', '/lots/not-an-id', { token: driver.token });
  check('invalid id -> 400', r.status === 400);

  section('5. Reservations and overlap prevention');
  const win = { startTime: hours(1), endTime: hours(3) };
  r = await api('POST', '/reservations', { token: driver.token, body: { slotId: slot._id, vehicleNumber: plate('HR26AB1234'), ...win } });
  check('book a slot -> 201 (status reserved)', r.status === 201 && r.body.data.status === 'reserved');
  const res1 = r.body.data;
  r = await api('POST', '/reservations', { token: driver.token, body: { slotId: slot._id, vehicleNumber: plate('DL01CD5678'), startTime: hours(2), endTime: hours(4) } });
  check('overlapping booking on same slot -> 409', r.status === 409);
  r = await api('POST', '/reservations', { token: driver.token, body: { slotId: slot._id, vehicleNumber: plate('DL01CD5678'), startTime: hours(3), endTime: hours(4) } });
  check('back-to-back booking (touching times) -> 201', r.status === 201);
  r = await api('POST', '/reservations', { token: driver.token, body: { slotId: slot2._id, vehicleNumber: plate('HR26AB1234'), startTime: hours(1.5), endTime: hours(2.5) } });
  check('same vehicle double booked in another slot -> 409', r.status === 409);
  r = await api('POST', '/reservations', { token: driver.token, body: { slotId: slot2._id, vehicleNumber: plate('UP16XY0001'), startTime: hours(5), endTime: hours(4) } });
  check('end before start -> 400', r.status === 400);
  r = await api('POST', '/reservations', { token: driver.token, body: { slotId: slot2._id, vehicleNumber: plate('UP16XY0001'), startTime: hours(-5), endTime: hours(-4) } });
  check('booking in the past -> 400', r.status === 400);
  r = await api('POST', '/reservations', { token: driver.token, body: { slotId: slot2._id, vehicleNumber: plate('!!'), startTime: hours(6), endTime: hours(7) } });
  check('bad vehicle number -> 400', r.status === 400);

  const raceWin = { startTime: hours(10), endTime: hours(12) };
  const racers = await Promise.all(
    ['PB10AA0001', 'PB10AA0002', 'PB10AA0003', 'PB10AA0004', 'PB10AA0005', 'PB10AA0006'].map((p) =>
      api('POST', '/reservations', { token: driver.token, body: { slotId: slot2._id, vehicleNumber: plate(p), ...raceWin } })
    )
  );
  const wins = racers.filter((x) => x.status === 201).length;
  check(`6 simultaneous requests for one slot -> exactly 1 succeeds (got ${wins})`, wins === 1 && racers.filter((x) => x.status === 409).length === 5);

  r = await api('GET', `/lots/${lotId}/slots?start=${hours(1)}&end=${hours(2)}`, { token: driver.token });
  check('availability reflects the booking', r.body.data.find((s) => s._id === slot._id).available === false);

  section('6. Reservation lifecycle and fee');
  const otherDriver = (await api('POST', '/auth/register', { body: { name: 'Other', email: `other${stamp}@test.com`, password: 'secret123' } })).body;
  r = await api('PATCH', `/reservations/${res1._id}/cancel`, { token: otherDriver.accessToken });
  check("another driver cannot touch my booking -> 403", r.status === 403);
  r = await api('PATCH', `/reservations/${res1._id}/checkin`, { token: driver.token });
  check('check-in far before start -> 400', r.status === 400);
  const lifecycle = await api('POST', '/reservations', { token: driver.token, body: { slotId: r2slot(), vehicleNumber: plate('MH12LC0001'), startTime: new Date(Date.now() + 60000).toISOString(), endTime: hours(5) } });
  function r2slot() { return slot2._id; }
  check('book a slot starting now', lifecycle.status === 201, JSON.stringify(lifecycle.body));
  const lc = lifecycle.body.data;
  r = await api('PATCH', `/reservations/${lc._id}/checkout`, { token: driver.token });
  check('checkout before check-in -> 409', r.status === 409);
  r = await api('PATCH', `/reservations/${lc._id}/checkin`, { token: driver.token });
  check('check-in -> status active', r.status === 200 && r.body.data.status === 'active');
  r = await api('PATCH', `/reservations/${lc._id}/cancel`, { token: driver.token });
  check('cannot cancel an active booking -> 409', r.status === 409);
  await Reservation.updateOne({ _id: lc._id }, { entryTime: new Date(Date.now() - 3.5 * 3600000) }); // simulate a 3.5 hour stay
  r = await api('PATCH', `/reservations/${lc._id}/checkout`, { token: manager.token });
  check('manager checks out -> fee = 4 started hours x 50 = 200', r.status === 200 && r.body.data.fee === 200 && r.body.data.billedHours === 4, JSON.stringify(r.body.data));
  r = await api('PATCH', `/reservations/${res1._id}/cancel`, { token: driver.token });
  check('cancel own reserved booking -> 200', r.status === 200 && r.body.data.status === 'cancelled');
  r = await api('GET', '/reservations/mine?limit=2', { token: driver.token });
  check('my reservations with pagination', r.status === 200 && r.body.data.length === 2 && r.body.pages >= 2);
  r = await api('GET', `/reservations?lotId=${lotId}`, { token: manager.token });
  check('manager sees bookings of own lot', r.status === 200 && r.body.total >= 3);
  r = await api('GET', '/reservations', { token: driver.token });
  check('driver cannot list all lot bookings -> 403', r.status === 403);

  section('7. Aggregation reports');
  r = await api('GET', `/reports/revenue?lotId=${lotId}`, { token: manager.token });
  check('revenue report (facet): totals + daily + byLot', r.status === 200 && r.body.totals.revenue === 200 && r.body.daily.length === 1 && r.body.byLot[0].lotName.startsWith('Test Lot'), JSON.stringify(r.body));
  const rangeQ = `from=${encodeURIComponent(hours(-24))}&to=${encodeURIComponent(hours(48))}`;
  r = await api('GET', `/reports/occupancy?lotId=${lotId}&${rangeQ}`, { token: manager.token });
  const occ = r.body.data?.[0];
  check('occupancy report: bookings, cancellation rate, occupancy %', r.status === 200 && occ.slots === 4 && occ.bookings >= 4 && occ.cancellationRate > 0, JSON.stringify(occ));
  r = await api('GET', `/reports/peak-hours?lotId=${lotId}`, { token: manager.token });
  check('peak-hours report returns 24 buckets', r.status === 200 && r.body.data.length === 24);
  r = await api('GET', '/reports/revenue', { token: manager.token });
  const otherLotLeak = r.body.byLot?.some((l) => l.lotName === 'City Center Parking' && l.revenue > 0);
  check("manager report only covers the manager's own lots", r.status === 200 && !otherLotLeak);
  r = await api('GET', '/admin/stats', { token: admin.token });
  check('admin stats (aggregation)', r.status === 200 && r.body.data.users.driver >= 1);

  section('8. Real-time availability (Socket.IO)');
  const noAuth = io(`http://localhost:${process.env.PORT || 5000}`, { auth: {}, reconnection: false });
  const rejected = await new Promise((resolve) => { noAuth.on('connect_error', (e) => resolve(e.message)); noAuth.on('connect', () => resolve('connected')); });
  check('socket without token is rejected', rejected.includes('Authentication error'), rejected);
  noAuth.close();
  const sock = io(`http://localhost:${process.env.PORT || 5000}`, { auth: { token: driver.token }, reconnection: false });
  await new Promise((resolve) => sock.on('connect', resolve));
  await new Promise((resolve) => sock.emit('lot:join', lotId, resolve));
  const update = new Promise((resolve) => sock.once('lot:changed', resolve));
  await api('POST', '/reservations', { token: otherDriver.accessToken, body: { slotId: slot2._id, vehicleNumber: plate('KA01LIVE001'), startTime: new Date().toISOString(), endTime: hours(1) } });
  const live = await Promise.race([update, new Promise((resolve) => setTimeout(() => resolve(null), 3000))]);
  check('booking pushes a live "lot:changed" event with fresh counts', live && live.total === 4 && live.available === 3, JSON.stringify(live));
  sock.close();

  section('9. Admin controls');
  const other = await api('GET', `/admin/users?q=other${stamp}`, { token: admin.token });
  const otherId = other.body.data[0]._id;
  r = await api('PATCH', `/admin/users/${otherId}/active`, { token: admin.token, body: { isActive: false } });
  check('admin blocks a user -> 200', r.status === 200 && r.body.data.isActive === false);
  r = await api('GET', '/auth/me', { token: otherDriver.accessToken });
  check('blocked user is locked out immediately -> 403', r.status === 403);
  r = await api('POST', '/auth/login', { body: { email: `other${stamp}@test.com`, password: 'secret123' } });
  check('blocked user cannot log in -> 403', r.status === 403);

  section('10. Cleanup rules');
  r = await api('DELETE', `/lots/${lotId}`, { token: manager.token });
  check('cannot delete a lot with open bookings -> 409', r.status === 409);
  r = await api('POST', '/auth/logout', { body: { refreshToken: driver.refresh } });
  check('logout -> 200', r.status === 200);
  r = await api('POST', '/auth/refresh', { body: { refreshToken: driver.refresh } });
  check('refresh token dead after logout -> 401', r.status === 401);
  r = await api('GET', '/nothing-here', {});
  check('unknown route -> 404 JSON', r.status === 404 && r.body.success === false);

  console.log(`\n${passed} passed, ${failed} failed`);
  await mongoose.disconnect();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
