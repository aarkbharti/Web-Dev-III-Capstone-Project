// Small per-key mutex. Booking a slot is a "check overlap, then insert" operation,
// so two requests for the same slot must not run that check at the same time.
const queues = new Map();

async function withLock(key, task) {
  const previous = queues.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => (release = resolve));
  queues.set(key, previous.then(() => current));
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (queues.get(key) === current) queues.delete(key);
  }
}

module.exports = withLock;
