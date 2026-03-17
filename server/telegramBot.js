require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const TelegramUser = require('./models/TelegramUser');

const token = process.env.TELEGRAM_BOT_TOKEN;
const adminId = parseInt(process.env.TELEGRAM_ADMIN_ID, 10);
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const isProduction = process.env.NODE_ENV === 'production';

let bot;

// =====================
// Initialize Telegram Bot
// =====================
if (isProduction) {
  bot = new TelegramBot(token);
  bot.setWebHook(`${BASE_URL}/bot${token}`);
  console.log("🌐 Telegram bot running via webhook");
} else {
  bot = new TelegramBot(token, { polling: true });
  console.log("💻 Telegram bot running in polling mode");
}

// =====================
// Error Handling
// =====================
bot.on("polling_error", err => console.error("❌ Telegram polling error:", err));
bot.on("webhook_error", err => console.error("❌ Telegram webhook error:", err));

// =====================
// Incoming Messages
// =====================
bot.on("message", async (msg) => {
  try {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    const username = msg.from.username ? `@${msg.from.username}` : msg.from.first_name || "User";

    console.log("📩 Incoming message:", { chatId, text, username });

    // -----------------
    // Handle /start TMP-XXXX
    // -----------------
    if (text?.startsWith("/start")) {
      const parts = text.split(" ");
      const tempId = parts[1];

      if (!tempId) {
        return bot.sendMessage(chatId, "👋 Please use the correct link with your Temp ID.");
      }

      console.log(`🔹 Saving user in DB: tempId=${tempId}, chatId=${chatId}, username=${username}`);
      await TelegramUser.updateOne(
        { tempId },
        { tempId, chatId, username },
        { upsert: true }
      );

      // ✅ Auto message to user
      await bot.sendMessage(chatId,
        `💙 Hello ${username}!\nYou are now connected to our support. Please wait while we verify your parcel (Temp ID: ${tempId}).`
      );
      console.log(`✅ Welcome message sent to user: ${tempId}`);

      // ✅ Notify admin
      await bot.sendMessage(adminId,
        `📩 New Telegram Connection:
━━━━━━━━━━━━━━━
🆔 Temp ID: ${tempId}
👤 Username: ${username}
💬 Chat ID: ${chatId}`
      );
      console.log(`✅ Admin notified of new user connection: ${tempId}`);

      return;
    }

    // -----------------
    // Admin replies to user
    // -----------------
    if (chatId === adminId && msg.reply_to_message) {
      const repliedUserId = msg.reply_to_message.forward_from?.id || msg.reply_to_message?.chat?.id;

      if (repliedUserId) {
        try {
          if (text) await bot.sendMessage(repliedUserId, text);
          if (msg.photo) {
            const fileId = msg.photo[msg.photo.length - 1].file_id;
            await bot.sendPhoto(repliedUserId, fileId, { caption: msg.caption || "" });
          }
          if (msg.document) {
            await bot.sendDocument(repliedUserId, msg.document.file_id, { caption: msg.caption || "" });
          }
          if (msg.video) {
            await bot.sendVideo(repliedUserId, msg.video.file_id, { caption: msg.caption || "" });
          }
          console.log("✅ Admin reply sent successfully");
        } catch (err) {
          console.error("❌ Failed to send media from admin to user:", err.response?.body || err);
        }
      }
      return;
    }

    // -----------------
    // Forward messages from user to admin
    // -----------------
    if (chatId !== adminId) {
      console.log(`🔹 Forwarding message from user chatId=${chatId} to admin`);

      await bot.forwardMessage(adminId, chatId, msg.message_id);

      if (msg.caption) await bot.sendMessage(adminId, `📝 Caption: ${msg.caption}`);
      if (text) await bot.sendMessage(adminId,
        `💬 Message from ${username} (Chat ID: ${chatId})\nReply to this message to respond.`
      );
    }

  } catch (err) {
    console.error("❌ Error processing incoming message:", err.response?.body || err);
  }
});

// =====================
// Admin command: /msg TMP-XXXX <text>
// =====================
bot.onText(/^\/msg\s+(\S+)\s+(.+)/, async (msg, match) => {
  try {
    if (!match) return;
    if (msg.chat.id !== adminId) return; // only admin

    const tempId = match[1];
    const messageText = match[2];

    console.log(`🔹 Admin sending message to tempId=${tempId}: ${messageText}`);
    const user = await TelegramUser.findOne({ tempId });

    if (!user) return bot.sendMessage(adminId, `❌ No user linked for ${tempId}.`);

    await bot.sendMessage(parseInt(user.chatId, 10), `📬 Admin: ${messageText}`);
    console.log("✅ Message sent to user via /msg");

    await bot.sendMessage(adminId, `✅ Message sent to ${tempId}`);
  } catch (err) {
    console.error("❌ Error in /msg command:", err.response?.body || err);
  }
});

// =====================
// Backend can send message to user
// =====================
async function sendMessageToUser(tempId, message) {
  try {
    console.log(`🔹 sendMessageToUser called for tempId=${tempId}`);
    const user = await TelegramUser.findOne({ tempId });

    if (!user) throw new Error("User not linked to Telegram yet.");

    const chatId = parseInt(user.chatId, 10);
    const result = await bot.sendMessage(chatId, message);
    console.log(`✅ Message successfully sent to user (${chatId}):`, result);
    return result;
  } catch (err) {
    console.error("❌ Error sending message to user:", err.response?.body || err);
    throw err;
  }
}

module.exports = { bot, sendMessageToUser };
