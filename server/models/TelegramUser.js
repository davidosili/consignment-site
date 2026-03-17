// models/TelegramUser.js
const mongoose = require('mongoose');

const telegramUserSchema = new mongoose.Schema({
  tempId: { type: String, required: true, unique: true },
  chatId: { type: Number, required: true },
  username: { type: String },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('TelegramUser', telegramUserSchema);
