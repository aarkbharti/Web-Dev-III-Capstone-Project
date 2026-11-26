const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema(
  {
    // Relationships: a reservation links a driver, a slot and the slot's lot
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    lot: { type: mongoose.Schema.Types.ObjectId, ref: 'Lot', required: true },
    slot: { type: mongoose.Schema.Types.ObjectId, ref: 'Slot', required: true },
    vehicleNumber: {
      type: String,
      required: [true, 'Vehicle number is required'],
      trim: true,
      uppercase: true,
      match: [/^[A-Z0-9\- ]{4,15}$/, 'Please enter a valid vehicle number'],
    },
    startTime: { type: Date, required: [true, 'Start time is required'] },
    endTime: {
      type: Date,
      required: [true, 'End time is required'],
      validate: { validator: function (v) { return v > this.startTime; }, message: 'End time must be after start time' },
    },
    status: { type: String, enum: ['reserved', 'active', 'completed', 'cancelled'], default: 'reserved' },
    entryTime: Date,
    exitTime: Date,
    fee: { type: Number, min: 0 },
    billedHours: Number,
  },
  { timestamps: true }
);

// Indexes: overlap check per slot, "my reservations" list, and manager/report queries per lot.
reservationSchema.index({ slot: 1, status: 1, startTime: 1, endTime: 1 });
reservationSchema.index({ user: 1, createdAt: -1 });
reservationSchema.index({ lot: 1, status: 1, exitTime: 1 });

module.exports = mongoose.model('Reservation', reservationSchema);
