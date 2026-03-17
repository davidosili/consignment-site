require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose'); // ensure mongoose is imported
const TelegramUser = require('./models/TelegramUser');

const token = process.env.TELEGRAM_BOT_TOKEN;
const adminId = parseInt(process.env.TELEGRAM_ADMIN_ID, 10);
const BASE_URL = process.env.BASE_URL || "https://www.rapidroutesltd.com";

// Initialize bot (webhook mode)
const bot = new TelegramBot(token);
console.log("🌐 Telegram bot initialized for webhook mode");

// =====================
// MongoDB helper: ensure connection
// =====================
async function ensureDbConnected() {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connected");
  }
}

// =====================
// Helper to link Temp ID → Telegram user
// =====================
async function linkTempId(chatId, tempId, username) {
  await ensureDbConnected();

  let user = await TelegramUser.findOne({ chatId });
  if (user) {
    if (!user.tempIds.includes(tempId)) {
      user.tempIds.push(tempId);
      console.log("🔹 Added new tempId to existing user:", tempId);
    }
  } else {
    user = new TelegramUser({ chatId, username, tempIds: [tempId] });
    console.log("🔹 Created new TelegramUser:", chatId, tempId);
  }

  await user.save();
  return user;
}

// =====================
// Webhook handler for Vercel
// =====================
async function webhookHandler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    await bot.processUpdate(req.body);
    return res.status(200).send('OK');
  } catch (err) {
    console.error('❌ Webhook error:', err);
    return res.status(500).send('Error');
  }
}

// =====================
// /start Command → link Temp ID
// =====================
bot.onText(/^\/start(?:\s+(.+))?/, async (msg, match) => {
  try {
    const chatId = msg.chat.id;
    const tempId = match[1]; // TMP-XXXX passed from ?start=
    const username = msg.from.username
      ? `@${msg.from.username}`
      : msg.from.first_name || "User";

    console.log("🚀 /start triggered:", { chatId, tempId });

    if (!tempId) {
      return bot.sendMessage(chatId,
        "👋 Welcome to Rapid Routes!\nPlease use your shipment link."
      );
    }

    // Link the user
    await linkTempId(chatId, tempId, username);

    // Auto-message to user
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

    console.log("✅ User linked and admin notified");

  } catch (err) {
    console.error("❌ /start error:", err);
    bot.sendMessage(msg.chat.id, '❌ Failed to link your Temp ID. Try again.');
  }
});

// =====================
// Forward messages / Admin replies
// =====================
bot.on('message', async (msg) => {
  try {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    const username = msg.from.username
      ? `@${msg.from.username}`
      : msg.from.first_name || "User";

    if (text?.startsWith("/start")) return;

    // Admin reply
    if (chatId === adminId && msg.reply_to_message) {
      const repliedUserId =
        msg.reply_to_message.forward_from?.id ||
        msg.reply_to_message?.chat?.id;

      if (repliedUserId) {
        if (text) await bot.sendMessage(repliedUserId, text);
        if (msg.photo) await bot.sendPhoto(repliedUserId, msg.photo[msg.photo.length-1].file_id, { caption: msg.caption || "" });
        if (msg.document) await bot.sendDocument(repliedUserId, msg.document.file_id, { caption: msg.caption || "" });
        if (msg.video) await bot.sendVideo(repliedUserId, msg.video.file_id, { caption: msg.caption || "" });
        console.log("✅ Admin reply sent");
      }
      return;
    }

    // Forward user messages to admin
    if (chatId !== adminId) {
      await bot.forwardMessage(adminId, chatId, msg.message_id);
      if (msg.caption) await bot.sendMessage(adminId, `📝 Caption: ${msg.caption}`);
      await bot.sendMessage(adminId, `💬 Message from ${username} (Chat ID: ${chatId})\nReply to respond.`);
      console.log(`🔹 Forwarded message from ${chatId} to admin`);
    }

  } catch (err) {
    console.error("❌ Message error:", err);
  }
});

// =====================
// Admin command: /msg TMP-XXXX <text>
// =====================
bot.onText(/^\/msg\s+(\S+)\s+(.+)/, async (msg, match) => {
  if (!match || msg.chat.id !== adminId) return;
  const tempId = match[1];
  const messageText = match[2];

  const user = await TelegramUser.findOne({ tempIds: tempId });
  if (!user) return bot.sendMessage(adminId, `❌ No user linked for ${tempId}`);

  await bot.sendMessage(user.chatId, `📬 Admin: ${messageText}`);
  await bot.sendMessage(adminId, `✅ Sent to ${tempId}`);
});

// =====================
// Backend → User Messaging
// =====================
async function sendMessageToUser(tempId, message) {
  await ensureDbConnected();
  const user = await TelegramUser.findOne({ tempIds: tempId });
  if (!user) throw new Error("User not linked to Telegram");
  return bot.sendMessage(user.chatId, message);
}

// =====================
// Backend helper to link user from API
// =====================
async function linkUserFromApi(tempId, chatId, username) {
  // This can be called from your /api/notify route
  return linkTempId(chatId, tempId, username);
}

module.exports = { bot, webhookHandler, sendMessageToUser, linkUserFromApi };
