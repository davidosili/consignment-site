// telegram.js
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const TelegramUser = require('./models/TelegramUser'); // MongoDB model

const token = process.env.TELEGRAM_BOT_TOKEN;
const adminId = parseInt(process.env.TELEGRAM_ADMIN_ID, 10);

// Detect environment
const isProduction = process.env.NODE_ENV === 'production';
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

let bot;
if (isProduction) {
  bot = new TelegramBot(token);
  bot.setWebHook(`${BASE_URL}/bot${token}`);
  console.log("🌐 Telegram bot running via webhook");
} else {
  bot = new TelegramBot(token, { polling: true });
  console.log("💻 Telegram bot running in polling mode");
}

// Handle errors
bot.on("polling_error", (err) => console.error("Telegram polling error:", err));
bot.on("webhook_error", (err) => console.error("Telegram webhook error:", err));

// 🔹 When a user starts the bot
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  const username = msg.from.username ? `@${msg.from.username}` : msg.from.first_name || "User";

  // Handle /start TMP-XXXX
  if (text?.startsWith("/start")) {
    const parts = text.split(" ");
    const tempId = parts[1];

    if (!tempId) {
      return bot.sendMessage(chatId, "👋 Please use the correct link with your Temp ID.");
    }

    // Save user in MongoDB
    await TelegramUser.updateOne(
      { tempId },
      { tempId, chatId, username },
      { upsert: true }
    );

    await bot.sendMessage(chatId,
      `💙 Hello ${username}!\nYou are now connected to our support. Please wait while we verify your parcel (Temp ID: ${tempId}).`
    );

    await bot.sendMessage(adminId,
      `📩 New Telegram Connection:
━━━━━━━━━━━━━━━
🆔 Temp ID: ${tempId}
👤 Username: ${username}
💬 Chat ID: ${chatId}`
    );

    return;
  }

  // Admin replying to user (text, photo, doc, video)
  if (chatId === adminId && msg.reply_to_message?.forward_from?.id) {
    const repliedUserId = msg.reply_to_message.forward_from.id;
    try {
      if (text) await bot.sendMessage(repliedUserId, text);
      if (msg.photo) {
        const fileId = msg.photo[msg.photo.length - 1].file_id;
        await bot.sendPhoto(repliedUserId, fileId, { caption: msg.caption || "" });
      }
      if (msg.document) {
        const fileId = msg.document.file_id;
        await bot.sendDocument(repliedUserId, fileId, { caption: msg.caption || "" });
      }
      if (msg.video) {
        const fileId = msg.video.file_id;
        await bot.sendVideo(repliedUserId, fileId, { caption: msg.caption || "" });
      }
    } catch (err) {
      console.error("❌ Failed to send media from admin to user:", err);
    }
    return;
  }

  // Forward any message from user to admin
  if (chatId !== adminId) {
    await bot.forwardMessage(adminId, chatId, msg.message_id);
    if (msg.caption) await bot.sendMessage(adminId, `📝 Caption: ${msg.caption}`);
    await bot.sendMessage(adminId, `💬 Message from ${username} (Chat ID: ${chatId})\nReply to this message to respond.`);
  }
});

// Optional command: /msg TMP-XXXX your message (admin only)
bot.onText(/^\/msg\s+(\S+)\s+(.+)/, async (msg, match) => {
  if (!match) return;
  const tempId = match[1];
  const messageText = match[2];

  if (msg.chat.id !== adminId) return; // only admin
  const user = await TelegramUser.findOne({ tempId });
  if (!user) return bot.sendMessage(adminId, `❌ No user linked for ${tempId}.`);

  await bot.sendMessage(user.chatId, `📬 Admin: ${messageText}`);
  await bot.sendMessage(adminId, `✅ Message sent to ${tempId}`);
});

// Allow backend to send messages to user
async function sendMessageToUser(tempId, message) {
  const user = await TelegramUser.findOne({ tempId });
  if (!user) throw new Error("User not linked to Telegram yet.");
  return bot.sendMessage(user.chatId, message);
}

module.exports = { bot, sendMessageToUser };
