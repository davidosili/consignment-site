const mongoose = require('mongoose');

const telegramUserSchema = new mongoose.Schema({
  chatId: {
    type: Number,
    required: true,
    unique: true, // each Telegram user is unique
  },

  username: {
    type: String,
    default: "User",
  },

  tempIds: [
    {
      type: String, // allows one user to have multiple shipment IDs
    }
  ],

  createdAt: {
    type: Date,
    default: Date.now,
  }
});

module.exports = mongoose.model('TelegramUser', telegramUserSchema);
