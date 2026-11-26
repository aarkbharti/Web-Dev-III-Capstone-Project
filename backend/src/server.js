require('dotenv').config({ quiet: true });
const http = require('http');
const connectDB = require('./config/db');
const app = require('./app');
const initSocket = require('./sockets');

const required = ['MONGO_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(', ')}. Copy .env.example to .env first.`);
  process.exit(1);
}

(async () => {
  await connectDB();
  // Make sure the indexes declared in the schemas exist (unique slot numbers, overlap lookups, ...).
  await Promise.all(Object.values(require('mongoose').models).map((m) => m.init()));
  const server = http.createServer(app);
  initSocket(server);
  const port = process.env.PORT || 5000;
  server.listen(port, () => console.log(`[server] ParkEasy API on http://localhost:${port}`));
})().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
