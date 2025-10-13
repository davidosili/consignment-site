// models/Tracking.js
const mongoose = require("mongoose");

function generateTrackingNumber() {
  const num = Math.floor(100000000 + Math.random() * 900000000);
  return `CRJ-${num}`;
}

const contactSchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: { type: String },
  phone: { type: String },
  email: { type: String }, // only for sender
  destinationOffice: { type: String } // only for receiver
}, { _id: false });

const updateSchema = new mongoose.Schema({
  location: String,
  status: String,
  timestamp: { type: Date, default: Date.now }
});

const itemSchema = new mongoose.Schema({
  itemId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String },
  weight: { type: Number },
  quantity: { type: Number, default: 1 },
  cost: { type: Number, default: 0 }
});


const trackingSchema = new mongoose.Schema({
  trackingNumber: { type: String, required: true, unique: true },
  sender: contactSchema,      // ✅ detailed sender info
  receiver: contactSchema,    // ✅ detailed receiver info
  origin: { type: String, required: true },
  destination: { type: String, required: true },
  location: { type: String, required: true },
  status: { type: String, default: "Collected" },
  expectedDelivery: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updates: [updateSchema],
  items: [itemSchema]
});

// Auto-generate tracking number
trackingSchema.pre("validate", function (next) {
  if (!this.trackingNumber || !this.trackingNumber.startsWith("CRJ-")) {
    this.trackingNumber = generateTrackingNumber();
  }
  next();
});

module.exports = mongoose.model("Tracking", trackingSchema);
     