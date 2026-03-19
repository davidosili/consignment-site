require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const TelegramUser = require('./models/TelegramUser');

const token = process.env.TELEGRAM_BOT_TOKEN;
const adminId = parseInt(process.env.TELEGRAM_ADMIN_ID, 10);

const bot = new TelegramBot(token);
console.log("🌐 Telegram bot initialized");

// =====================
// DB Helper for linking users
// =====================
async function linkUserFromApi(tempId, chatId, username) {
  if (!tempId || !chatId) throw new Error("tempId and chatId required");

  // Ensure DB connected (optimized for Vercel/Serverless)
  if (mongoose.connection.readyState !== 1) {
    console.log("⏳ Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000 // Stop waiting after 5 seconds
    });
    console.log("✅ MongoDB connected (linkUserFromApi)");
  }

  // Find user with a strict time limit to prevent Vercel 504 errors
  let user = await TelegramUser.findOne({ chatId }).maxTimeMS(5000);
  
  if (user) {
    if (!user.tempIds.includes(tempId)) {
      user.tempIds.push(tempId);
    }
  } else {
    user = new TelegramUser({ chatId, username, tempIds: [tempId] });
  }

  await user.save();
  console.log(`✅ TelegramUser linked: ${tempId} → ${chatId}`);
  return user;
}

// =====================
// Send message to user by tempId (For future status updates)
// =====================
async function sendMessageToUser(tempId, message) {
  const user = await TelegramUser.findOne({ tempIds: tempId });
  if (!user) throw new Error(`User not linked to Telegram for Temp ID: ${tempId}`);
  return bot.sendMessage(user.chatId, message);
}

// =====================
// /start command (Triggered when user clicks the link on the site)
// =====================
bot.onText(/^\/start(?:\s+(.+))?/, async (msg, match) => {
  try {
    const chatId = msg.chat.id;
    const tempId = match[1]; // TMP-XXXX from the deeplink
    const username = msg.from.username ? `@${msg.from.username}` : msg.from.first_name || "User";

    console.log("🚀 /start triggered:", { chatId, tempId });

    if (!tempId) {
      return bot.sendMessage(chatId, "👋 Welcome to Rapid Routes! Please use your specific shipment link to get started.");
    }

    // 1. Link the user in the database
    await linkUserFromApi(tempId, chatId, username);

    // 2. Send success message to the user
    await bot.sendMessage(chatId,
      `👋 Hi ${username}! We’ve successfully linked your Telegram.\n\n` +
      `Our team will reach out to you here regarding your parcel (Tracking ID: ${tempId}).`
    );

    // 3. Notify admin that a user connected their Telegram
    await bot.sendMessage(adminId,
      `🔗 User Linked via Telegram
━━━━━━━━━━━━━━━
🆔 Temp ID: ${tempId}
👤 Username: ${username}
💬 Chat ID: ${chatId}`
    );

  } catch (err) {
    console.error("❌ /start error:", err);
    bot.sendMessage(msg.chat.id, "❌ Failed to link your Tracking ID. Please try clicking the link on the website again.");
  }
});

module.exports = { bot, linkUserFromApi, sendMessageToUser };
