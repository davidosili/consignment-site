require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const token = process.env.TELEGRAM_BOT_TOKEN;
const adminId = parseInt(process.env.TELEGRAM_ADMIN_ID, 10);

const bot = new TelegramBot(token, { polling: true });

// Handle errors
bot.on("polling_error", (err) => console.error("Telegram polling error:", err));

// When a user starts the bot
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();

  // ✅ When user opens bot via /start TMP-XXXX link
  if (text && text.startsWith("/start")) {
    const parts = text.split(" ");
    const tempId = parts[1];

    if (tempId) {
      await bot.sendMessage(chatId,
        `💙 Thank you for your submission! 
You are being redirected to our customer care service line to complete payment for your parcel (Temp ID: ${tempId}).`
      );

      // notify admin too
      await bot.sendMessage(adminId, `📦 New Telegram Start:\nTemp ID: ${tempId}\nTelegram ID: ${chatId}`);
    } else {
      await bot.sendMessage(chatId,
        "👋 Welcome to Rapid Route! Please provide your Temp ID so we can continue your delivery process."
      );
    }
  }
});

module.exports = { bot };
