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

      console.log(`🔹 Linking user: chatId=${chatId}, tempId=${tempId}`);

      // ✅ NEW LOGIC (IMPORTANT)
      let user = await TelegramUser.findOne({ chatId });

      if (!user) {
        user = new TelegramUser({
          chatId,
          username,
          tempIds: [tempId],
        });
      } else {
        if (!user.tempIds.includes(tempId)) {
          user.tempIds.push(tempId);
        }
      }

      await user.save();
      console.log("✅ Telegram user saved:", user);

      // ✅ Send welcome message
      await bot.sendMessage(chatId,
        `💙 Hello ${username}!\nYou are now connected to support.\nTracking ID: ${tempId}`
      );

      // ✅ Notify admin
      await bot.sendMessage(adminId,
        `📩 New Telegram Connection
━━━━━━━━━━━━━━━
🆔 Temp ID: ${tempId}
👤 Username: ${username}
💬 Chat ID: ${chatId}`
      );

      return;
    }

    // -----------------
    // Admin replies to user
    // -----------------
    if (chatId === adminId && msg.reply_to_message) {
      const repliedUserId =
        msg.reply_to_message.forward_from?.id ||
        msg.reply_to_message?.chat?.id;

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

          console.log("✅ Admin reply sent");
        } catch (err) {
          console.error("❌ Admin reply failed:", err.response?.body || err);
        }
      }
      return;
    }

    // -----------------
    // Forward user messages to admin
    // -----------------
    if (chatId !== adminId) {
      console.log(`🔹 Forwarding message from ${chatId} to admin`);

      await bot.forwardMessage(adminId, chatId, msg.message_id);

      if (msg.caption) {
        await bot.sendMessage(adminId, `📝 Caption: ${msg.caption}`);
      }

      await bot.sendMessage(adminId,
        `💬 Message from ${username} (Chat ID: ${chatId})\nReply to respond.`
      );
    }

  } catch (err) {
    console.error("❌ Message processing error:", err.response?.body || err);
  }
});

// =====================
// Admin command: /msg TMP-XXXX <text>
// =====================
bot.onText(/^\/msg\s+(\S+)\s+(.+)/, async (msg, match) => {
  try {
    if (!match) return;
    if (msg.chat.id !== adminId) return;

    const tempId = match[1];
    const messageText = match[2];

    console.log(`🔹 Admin sending to ${tempId}: ${messageText}`);

    // ✅ UPDATED lookup
    const user = await TelegramUser.findOne({
      tempIds: tempId
    });

    if (!user) {
      return bot.sendMessage(adminId, `❌ No user linked for ${tempId}`);
    }

    await bot.sendMessage(user.chatId, `📬 Admin: ${messageText}`);
    await bot.sendMessage(adminId, `✅ Sent to ${tempId}`);

  } catch (err) {
    console.error("❌ /msg error:", err.response?.body || err);
  }
});

// =====================
// Backend → User message
// =====================
async function sendMessageToUser(tempId, message) {
  try {
    console.log(`🔹 Sending to tempId=${tempId}`);

    // ✅ UPDATED lookup
    const user = await TelegramUser.findOne({
      tempIds: tempId
    });

    if (!user) {
      throw new Error("User not linked to Telegram");
    }

    const result = await bot.sendMessage(user.chatId, message);
    console.log("✅ Message sent:", result);

    return result;
  } catch (err) {
    console.error("❌ Send message error:", err.response?.body || err);
    throw err;
  }
}

module.exports = { bot, sendMessageToUser };
