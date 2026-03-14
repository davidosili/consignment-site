require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const token = process.env.TELEGRAM_BOT_TOKEN;
const adminId = parseInt(process.env.TELEGRAM_ADMIN_ID, 10);

// Detect environment
const isProduction = process.env.NODE_ENV === 'production';
const BASE_URL = process.env.BASE_URL || "https://consignment-site.vercel.app";

// ✅ Use polling locally, webhook on Render
let bot;
if (isProduction) {
  bot = new TelegramBot(token);
  bot.setWebHook(`${BASE_URL}/bot${token}`);
  console.log("🌐 Telegram bot running via webhook");
} else {
  bot = new TelegramBot(token, { polling: true });
  console.log("💻 Telegram bot running in polling mode");
}

// tempId -> chatId mapping
const userMap = new Map();

// Handle errors
bot.on("polling_error", (err) => console.error("Telegram polling error:", err));
bot.on("webhook_error", (err) => console.error("Telegram webhook error:", err));

// 🔹 When a user starts the bot
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  const username = msg.from.username ? `@${msg.from.username}` : msg.from.first_name || "User";

  // ✅ Handle /start TMP-XXXX
  if (text?.startsWith("/start")) {
    const parts = text.split(" ");
    const tempId = parts[1];

    if (tempId) {
      userMap.set(tempId, chatId);

      await bot.sendMessage(chatId,
        `💙 Hello ${username}!  
You are now connected to our support. Please wait while we verify your parcel (Temp ID: ${tempId}).`
      );

      await bot.sendMessage(adminId,
        `📩 New Telegram Connection:
━━━━━━━━━━━━━━━
🆔 Temp ID: ${tempId}
👤 Username: ${username}
💬 Chat ID: ${chatId}`
      );
    } else {
      await bot.sendMessage(chatId, "👋 Please use the correct link with your Temp ID.");
    }
    return;
  }

  // ✅ Admin replying to user (text, photo, doc, video)
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

  // ✅ If message comes from a user
  if (chatId !== adminId) {
    // Forward *any type of message* (text, photo, doc, video, etc.)
    await bot.forwardMessage(adminId, chatId, msg.message_id);

    // If caption exists, include it
    if (msg.caption) {
      await bot.sendMessage(adminId, `📝 Caption: ${msg.caption}`);
    }

    await bot.sendMessage(
      adminId,
      `💬 Message from ${username} (Chat ID: ${chatId})\nReply to this message to respond.`
    );
  }
});

// ✅ Optional command: /msg TMP-XXXX your message
bot.onText(/^\/msg\s+(\S+)\s+(.+)/, async (msg, match) => {
  const tempId = match[1];
  const messageText = match[2];

  if (msg.chat.id !== adminId) return; // only admin can use
  const chatId = userMap.get(tempId);
  if (!chatId) return bot.sendMessage(adminId, `❌ No user linked for ${tempId}.`);

  await bot.sendMessage(chatId, `📬 Admin: ${messageText}`);
  await bot.sendMessage(adminId, `✅ Message sent to ${tempId}`);
});

// Allow backend to send direct messages too
function sendMessageToUser(tempId, message) {
  const chatId = userMap.get(tempId);
  if (!chatId) throw new Error("User not linked to Telegram yet.");
  return bot.sendMessage(chatId, message);
}

module.exports = { bot, userMap, sendMessageToUser };
