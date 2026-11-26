const mongoose = require('mongoose');

const lotSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Lot name is required'], trim: true, minlength: 2, maxlength: 80 },
    address: { type: String, required: [true, 'Address is required'], trim: true, maxlength: 200 },
    city: { type: String, required: [true, 'City is required'], trim: true, index: true },
    ratePerHour: { type: Number, required: [true, 'Rate per hour is required'], min: [1, 'Rate must be at least 1'] },
    // Relationship: every lot belongs to one manager (User)
    manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Lot', lotSchema);
