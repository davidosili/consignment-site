require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const token = process.env.TELEGRAM_BOT_TOKEN;
const adminId = parseInt(process.env.TELEGRAM_ADMIN_ID, 10);

const bot = new TelegramBot(token, { polling: true });

// Map to store Temp ID -> Telegram User ID
const userMap = new Map();

// Log polling errors for debugging
bot.on("polling_error", (err) => {
  console.error("Telegram polling error:", err);
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();

  // If message is from a normal user
  if (chatId !== adminId) {
    if (text && text.startsWith("TMP-")) {
      const tempId = text;
      userMap.set(tempId, chatId);

      await bot.sendMessage(chatId, `✅ Thanks! Your Temp ID (${tempId}) is now linked.`);
      await bot.sendMessage(
        adminId,
        `🔗 New user linked:\nTemp ID: ${tempId}\nTelegram ID: ${chatId}`
      );
    } else {
      await bot.sendMessage(
        chatId,
        "👋 Please send your Temp ID (e.g., TMP-12345) so we can link your submission."
      );
    }
  }

  // Allow admin to reply to forwarded messages (optional)
  else if (msg.reply_to_message) {
    const repliedUserId = msg.reply_to_message.forward_from?.id;
    if (repliedUserId) {
      bot.sendMessage(repliedUserId, msg.text);
    }
  }
});

module.exports = { bot, userMap };
