// telegramBot.js
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
bot.on("polling_error", (err) => console.error("❌ Telegram polling error:", err));
bot.on("webhook_error", (err) => console.error("❌ Telegram webhook error:", err));

// 🔹 When a user starts the bot
bot.on("message", async (msg) => {
  try {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    const username = msg.from.username ? `@${msg.from.username}` : msg.from.first_name || "User";

    console.log("📩 Incoming message:", { chatId, text, username });

    // Handle /start TMP-XXXX
    if (text?.startsWith("/start")) {
      const parts = text.split(" ");
      const tempId = parts[1];

      if (!tempId) {
        console.log("⚠️ /start command missing tempId");
        return bot.sendMessage(chatId, "👋 Please use the correct link with your Temp ID.");
      }

      console.log(`🔹 Saving user in DB: tempId=${tempId}, chatId=${chatId}, username=${username}`);
      await TelegramUser.updateOne(
        { tempId },
        { tempId, chatId, username },
        { upsert: true }
      );

      await bot.sendMessage(chatId,
        `💙 Hello ${username}!\nYou are now connected to our support. Please wait while we verify your parcel (Temp ID: ${tempId}).`
      );
      console.log(`✅ Welcome message sent to user: tempId=${tempId}`);

      await bot.sendMessage(adminId,
        `📩 New Telegram Connection:
━━━━━━━━━━━━━━━
🆔 Temp ID: ${tempId}
👤 Username: ${username}
💬 Chat ID: ${chatId}`
      );
      console.log(`✅ Admin notified of new user connection: tempId=${tempId}`);
      return;
    }

    // Admin replying to user (text, photo, doc, video)
    if (chatId === adminId && msg.reply_to_message?.forward_from?.id) {
      const repliedUserId = msg.reply_to_message.forward_from.id;
      console.log(`🔹 Admin replying to user chatId=${repliedUserId}`);

      try {
        if (text) {
          await bot.sendMessage(repliedUserId, text);
          console.log("✅ Text message sent to user");
        }
        if (msg.photo) {
          const fileId = msg.photo[msg.photo.length - 1].file_id;
          await bot.sendPhoto(repliedUserId, fileId, { caption: msg.caption || "" });
          console.log("✅ Photo sent to user");
        }
        if (msg.document) {
          const fileId = msg.document.file_id;
          await bot.sendDocument(repliedUserId, fileId, { caption: msg.caption || "" });
          console.log("✅ Document sent to user");
        }
        if (msg.video) {
          const fileId = msg.video.file_id;
          await bot.sendVideo(repliedUserId, fileId, { caption: msg.caption || "" });
          console.log("✅ Video sent to user");
        }
      } catch (err) {
        console.error("❌ Failed to send media from admin to user:", err);
      }
      return;
    }

    // Forward any message from user to admin
    if (chatId !== adminId) {
      console.log(`🔹 Forwarding message from user chatId=${chatId} to admin`);
      await bot.forwardMessage(adminId, chatId, msg.message_id);
      if (msg.caption) await bot.sendMessage(adminId, `📝 Caption: ${msg.caption}`);
      await bot.sendMessage(adminId, `💬 Message from ${username} (Chat ID: ${chatId})\nReply to this message to respond.`);
    }
  } catch (err) {
    console.error("❌ Error processing incoming message:", err);
  }
});

// Optional command: /msg TMP-XXXX your message (admin only)
bot.onText(/^\/msg\s+(\S+)\s+(.+)/, async (msg, match) => {
  try {
    if (!match) return;
    const tempId = match[1];
    const messageText = match[2];

    if (msg.chat.id !== adminId) return; // only admin
    console.log(`🔹 Admin sending message to tempId=${tempId}: ${messageText}`);

    const user = await TelegramUser.findOne({ tempId });
    if (!user) {
      console.log(`⚠️ No user linked for tempId=${tempId}`);
      return bot.sendMessage(adminId, `❌ No user linked for ${tempId}.`);
    }

    await bot.sendMessage(user.chatId, `📬 Admin: ${messageText}`);
    console.log("✅ Message sent to user via /msg");
    await bot.sendMessage(adminId, `✅ Message sent to ${tempId}`);
  } catch (err) {
    console.error("❌ Error in /msg command:", err);
  }
});

// Allow backend to send messages to user
async function sendMessageToUser(tempId, message) {
  try {
    console.log(`🔹 sendMessageToUser called for tempId=${tempId}`);
    const user = await TelegramUser.findOne({ tempId });
    console.log("🔹 User fetched from DB:", user);

    if (!user) {
      console.log(`⚠️ User not linked to Telegram yet: tempId=${tempId}`);
      throw new Error("User not linked to Telegram yet.");
    }

    const result = await bot.sendMessage(user.chatId, message);
    console.log("✅ Message successfully sent to user:", result);
    return result;
  } catch (err) {
    console.error("❌ Error sending message to user:", err);
    throw err;
  }
}

module.exports = { bot, sendMessageToUser };
