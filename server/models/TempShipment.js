// server/models/TempShipment.js
const mongoose = require("mongoose");

const tempShipmentSchema = new mongoose.Schema(
  {
    tempId: { type: String, required: true, unique: true },

    sender: {
      name: String,
      email: String,
      phone: String,
      address: String,
    },

    receiver: {
      name: String,
      email: String,
      phone: String,
      address: String,
    },

    items: [
      {
        description: String,
        weight: String,
        cost: String,
        quantity: { type: Number, default: 1 },
      },
    ],

    status: {
      type: String,
      default: "Pending Receiver Info",
    },

    telegramChatId: {
      type: String, // stores Telegram chat ID when linked
      default: null,
    },
  },
  { timestamps: true }
);

// Optional helper: check if shipment is linked to Telegram
tempShipmentSchema.methods.isLinkedToTelegram = function () {
  return !!this.telegramChatId;
};

module.exports = mongoose.model("TempShipment", tempShipmentSchema);
