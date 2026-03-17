const mongoose = require("mongoose");

const telegramUserSchema = new mongoose.Schema({
  chatId: { type: Number, required: true, unique: true },
  username: { type: String, default: "User" },
  tempIds: [{ type: String }], // multiple shipments per user
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("TelegramUser", telegramUserSchema);
