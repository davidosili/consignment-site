require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const TelegramUser = require('./models/TelegramUser');

const token = process.env.TELEGRAM_BOT_TOKEN;
const adminId = parseInt(process.env.TELEGRAM_ADMIN_ID, 10);
const BASE_URL = process.env.BASE_URL || "https://www.rapidroutesltd.com";

const bot = new TelegramBot(token);
console.log("🌐 Telegram bot initialized");

// =====================
// DB Helper for linking users
// =====================
async function linkUserFromApi(tempId, chatId, username) {
  if (!tempId || !chatId) throw new Error("tempId and chatId required");

  // Ensure DB connected
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connected (linkUserFromApi)");
  }

  let user = await TelegramUser.findOne({ chatId });
  if (user) {
    if (!user.tempIds.includes(tempId)) user.tempIds.push(tempId);
  } else {
    user = new TelegramUser({ chatId, username, tempIds: [tempId] });
  }

  await user.save();
  console.log(`✅ TelegramUser linked: ${tempId} → ${chatId}`);
  return user;
}

// =====================
// Send message to user by tempId
// =====================
async function sendMessageToUser(tempId, message) {
  const user = await TelegramUser.findOne({ tempIds: tempId });
  if (!user) throw new Error("User not linked to Telegram");
  return bot.sendMessage(user.chatId, message);
}

// =====================
// /start command
// =====================
bot.onText(/^\/start(?:\s+(.+))?/, async (msg, match) => {
  try {
    const chatId = msg.chat.id;
    const tempId = match[1]; // TMP-XXXX
    const username = msg.from.username ? `@${msg.from.username}` : msg.from.first_name || "User";

    console.log("🚀 /start triggered:", { chatId, tempId });

    if (!tempId) {
      return bot.sendMessage(chatId, "👋 Welcome! Use your shipment link to start.");
    }

    await linkUserFromApi(tempId, chatId, username);

    // Auto-message with receiver link
    await bot.sendMessage(chatId,
      `💙 Hello ${username}!\nTracking ID: ${tempId}\n` +
      `Complete your details here:\n${BASE_URL}/receiver.html?id=${tempId}`
    );

    // Notify admin
    await bot.sendMessage(adminId,
      `📩 New Telegram Connection
━━━━━━━━━━━━━━━
🆔 Temp ID: ${tempId}
👤 Username: ${username}
💬 Chat ID: ${chatId}`
    );

  } catch (err) {
    console.error("❌ /start error:", err);
    bot.sendMessage(msg.chat.id, "❌ Failed to link your Temp ID. Try again.");
  }
});

module.exports = { bot, linkUserFromApi, sendMessageToUser };
