// telegramBot.js
const TelegramBot = require("node-telegram-bot-api");

const BOT_TOKEN =
  process.env.NODE_ENV === "production"
    ? process.env.TELEGRAM_BOT_TOKEN_PROD
    : process.env.TELEGRAM_BOT_TOKEN_DEV;

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

// Create bot (no polling yet)
const bot = new TelegramBot(BOT_TOKEN, { polling: false });

// Temporary mapping of tempId <-> Telegram chat ID
const userMap = new Map();

// --- Webhook setup ---
function setupWebhook(app) {
  const webhookUrl = `https://rapidroutesltd.onrender.com/bot/${BOT_TOKEN}`;
  bot.setWebHook(webhookUrl);

  app.post(`/bot/${BOT_TOKEN}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  });

  console.log(`📡 Webhook set up at ${webhookUrl}`);
}

// --- Handlers ---
bot.onText(/\/start (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const tempId = match[1].trim();

  userMap.set(tempId, chatId);

  bot.sendMessage(
    chatId,
    `✅ Thank you for your submission!\nOur customer care team will contact you shortly.\n\nTemp ID: ${tempId}`
  );

  bot.sendMessage(
    ADMIN_CHAT_ID,
    `📩 New user connected!\nTemp ID: ${tempId}\nChat ID: ${chatId}`
  );
});

// Admin /msg TMP-12345 message
bot.onText(/\/msg (TMP-\d+)\s+([\s\S]+)/, (msg, match) => {
  const senderId = msg.chat.id;
  if (senderId.toString() !== ADMIN_CHAT_ID.toString()) {
    return bot.sendMessage(senderId, "⛔ You are not authorized to use this command.");
  }

  const tempId = match[1];
  const text = match[2];
  const userChatId = userMap.get(tempId);

  if (!userChatId) return bot.sendMessage(senderId, `⚠️ No user found for ${tempId}.`);

  bot.sendMessage(userChatId, `📩 Message from Admin:\n${text}`);
  bot.sendMessage(senderId, `✅ Sent message to ${tempId}.`);
});

// Relay messages from users → admin
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  if (chatId.toString() === ADMIN_CHAT_ID.toString()) return;

  const tempId = [...userMap.entries()].find(([_, id]) => id === chatId)?.[0];
  if (tempId) {
    bot.sendMessage(ADMIN_CHAT_ID, `💬 Message from ${tempId}:\n${msg.text}`);
  }
});

// Admin reply to forwarded message
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  if (chatId.toString() !== ADMIN_CHAT_ID.toString()) return;

  if (msg.reply_to_message?.text) {
    const match = msg.reply_to_message.text.match(/from (TMP-\d+)/);
    if (match) {
      const tempId = match[1];
      const userChatId = userMap.get(tempId);
      if (userChatId) {
        bot.sendMessage(userChatId, `📩 Admin Reply:\n${msg.text}`);
        bot.sendMessage(chatId, `✅ Replied to ${tempId}.`);
      }
    }
  }
});

console.log("🤖 Telegram bot module loaded.");

// Helper for external use
function sendMessageToUser(tempId, message) {
  const userChatId = userMap.get(tempId);
  if (!userChatId) throw new Error(`No Telegram chat linked for ${tempId}`);
  return bot.sendMessage(userChatId, message);
}

module.exports = { bot, setupWebhook, sendMessageToUser };
