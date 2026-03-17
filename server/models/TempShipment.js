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
    status: { type: String, default: "Pending Receiver Info" },
    telegramChatId: { type: String, default: null }, // Telegram linkage
  },
  { timestamps: true }
);

// Helper method
tempShipmentSchema.methods.isLinkedToTelegram = function () {
  return !!this.telegramChatId;
};

module.exports = mongoose.model("TempShipment", tempShipmentSchema);
