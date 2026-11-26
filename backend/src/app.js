const express = require('express');
const cors = require('./middleware/cors');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();
app.use(cors);
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (req, res) => res.json({ success: true, message: 'ParkEasy API is running' }));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/lots', require('./routes/lotRoutes'));
app.use('/api/slots', require('./routes/slotRoutes'));
app.use('/api/reservations', require('./routes/reservationRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
