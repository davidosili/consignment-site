// telegramBot.js
const TelegramBot = require("node-telegram-bot-api");

// Replace this with your bot token
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID; // your Telegram user ID

const bot = new TelegramBot(BOT_TOKEN);
bot.setWebHook('https://rapidroutesltd.onrender.com/bot' + BOT_TOKEN);

app.post('/bot' + BOT_TOKEN, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});


// Temporary mapping of tempId <-> Telegram chat ID
const userMap = new Map();

// Handle user start command like /start TMP-12345
bot.onText(/\/start (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const tempId = match[1].trim();

  userMap.set(tempId, chatId);

  bot.sendMessage(
    chatId,
    `✅ Thank you for your submission!\nOur customer care team will contact you shortly.\n\nTemp ID: ${tempId}`
  );

  // Notify admin
  bot.sendMessage(
    ADMIN_CHAT_ID,
    `📩 New user connected!\nTemp ID: ${tempId}\nChat ID: ${chatId}`
  );
});

// Handle admin /msg command
bot.onText(/\/msg (TMP-\d+)\s+([\s\S]+)/, (msg, match) => {
  const senderId = msg.chat.id;
  if (senderId.toString() !== ADMIN_CHAT_ID.toString()) {
    bot.sendMessage(senderId, "⛔ You are not authorized to use this command.");
    return;
  }

  const tempId = match[1];
  const text = match[2];
  const userChatId = userMap.get(tempId);

  if (!userChatId) {
    bot.sendMessage(senderId, `⚠️ No user found for ${tempId}.`);
    return;
  }

  bot.sendMessage(userChatId, `📩 Message from Admin:\n${text}`);
  bot.sendMessage(senderId, `✅ Sent message to ${tempId}.`);
});

// Relay messages from users to admin
bot.on("message", (msg) => {
  const chatId = msg.chat.id;

  // Ignore admin messages handled by /msg
  if (chatId.toString() === ADMIN_CHAT_ID.toString()) return;

  // Find which tempId belongs to this user
  const tempId = [...userMap.entries()].find(
    ([, id]) => id === chatId
  )?.[0];

  if (tempId) {
    // Forward to admin
    bot.sendMessage(
      ADMIN_CHAT_ID,
      `💬 Message from ${tempId}:\n${msg.text}`
    );
  }
});

// Handle admin reply to forwarded messages
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  if (chatId.toString() !== ADMIN_CHAT_ID.toString()) return;

  if (msg.reply_to_message && msg.reply_to_message.text) {
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

console.log("🤖 Telegram bot is running...");

function sendMessageToUser(tempId, message) {
  const userChatId = userMap.get(tempId);
  if (!userChatId) throw new Error(`No Telegram chat linked for ${tempId}`);
  return bot.sendMessage(userChatId, message);
}

module.exports = { bot, sendMessageToUser };
