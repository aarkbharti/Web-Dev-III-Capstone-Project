const mongoose = require('mongoose');

const slotSchema = new mongoose.Schema(
  {
    // Relationship: a slot belongs to one lot
    lot: { type: mongoose.Schema.Types.ObjectId, ref: 'Lot', required: true },
    number: { type: String, required: [true, 'Slot number is required'], trim: true, uppercase: true },
    type: { type: String, enum: ['car', 'bike', 'ev'], default: 'car' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Index: slot numbers are unique inside a lot, and lot lookups are fast.
slotSchema.index({ lot: 1, number: 1 }, { unique: true });

module.exports = mongoose.model('Slot', slotSchema);
