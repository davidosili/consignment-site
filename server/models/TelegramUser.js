const mongoose = require("mongoose");

const telegramUserSchema = new mongoose.Schema({
  chatId: { 
    type: Number, 
    required: true, 
    unique: true 
  },
  username: { 
    type: String, 
    default: "User" 
  },
  tempIds: [
    { type: String }
  ], // allows multiple shipments per user
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  // ========================================
  // SESSION STATE (Serverless-Safe)
  // ========================================
  currentSession: {
    state: { 
      type: String, 
      enum: ["IDLE", "AWAITING_ADMIN_RESPONSE", "AWAITING_INFO"],
      default: "IDLE"
    },
    tempId: { type: String, default: null }, // Which shipment are we talking about?
    lastInteraction: { type: Date, default: Date.now }, // For session timeout detection
    context: { type: String, default: null }, // What was the last question/request?
  }
});

// Helper to check if session is stale (older than 30 minutes)
telegramUserSchema.methods.isSessionStale = function () {
  if (!this.currentSession.lastInteraction) return true;
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  return this.currentSession.lastInteraction < thirtyMinutesAgo;
};

module.exports = mongoose.model("TelegramUser", telegramUserSchema);
