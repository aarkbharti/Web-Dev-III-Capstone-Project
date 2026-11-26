// Parking fee: billed per started hour, minimum one hour.
function calculateFee(entryTime, exitTime, ratePerHour) {
  const ms = Math.max(0, new Date(exitTime) - new Date(entryTime));
  const hours = Math.max(1, Math.ceil(ms / 3600000));
  return { hours, amount: hours * ratePerHour };
}
module.exports = { calculateFee };
