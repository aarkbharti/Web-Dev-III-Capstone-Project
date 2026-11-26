const { Server } = require('socket.io');
const User = require('../models/User');
const Lot = require('../models/Lot');
const events = require('../utils/events');
const { verifyAccessToken } = require('../utils/tokens');
const { getLotAvailability } = require('../services/availability');

function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((s) => s.trim().replace(/\/+$/, '')) },
  });

  // JWT is checked during the handshake, so anonymous clients can never connect.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication error: token missing'));
      const payload = verifyAccessToken(token);
      const user = await User.findById(payload.id);
      if (!user || !user.isActive) return next(new Error('Authentication error: user not allowed'));
      socket.user = { id: String(user._id), role: user.role, name: user.name };
      next();
    } catch {
      next(new Error('Authentication error: invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('lot:join', async (lotId, ack) => {
      const lot = await Lot.findById(lotId).catch(() => null);
      if (!lot) return ack?.({ ok: false, message: 'Lot not found' });
      socket.join(`lot:${lotId}`);
      ack?.({ ok: true });
    });
    socket.on('lot:leave', (lotId) => socket.leave(`lot:${lotId}`));
  });

  // Anything that changes a lot (booking, cancel, check-in, check-out, new slots) ends up here.
  events.on('lot:changed', async (lotId) => {
    try {
      const stats = await getLotAvailability([lotId]);
      const payload = { lotId, ...stats[lotId], at: new Date().toISOString() };
      io.to(`lot:${lotId}`).emit('lot:changed', payload); // lot page
      io.to('lots:all').emit('lot:changed', payload); // lot list page
    } catch (err) {
      console.error('[socket] failed to broadcast', err.message);
    }
  });

  io.on('connection', (socket) => {
    socket.on('lots:subscribe', () => socket.join('lots:all'));
    socket.on('lots:unsubscribe', () => socket.leave('lots:all'));
  });

  return io;
}

module.exports = initSocket;
