const TelegramBot = require('node-telegram-bot-api');

const token = process.env.TELEGRAM_BOT_TOKEN;

// ❗ NO polling here
const bot = new TelegramBot(token);

// Store users (you can replace with DB later)
const userMap = new Map();

// Handle incoming webhook updates
const handleUpdate = async (update) => {
  if (update.message) {
    const chatId = update.message.chat.id;
    const text = update.message.text;

    // Example: user sends /start TEMP123
    if (text && text.startsWith('/start')) {
      const tempId = text.split(' ')[1];

      if (tempId) {
        userMap.set(tempId, chatId);

        await bot.sendMessage(
          chatId,
          `✅ You are now linked! We'll notify you about your delivery.`
        );
      } else {
        await bot.sendMessage(chatId, `Send /start YOUR_TEMP_ID to link.`);
      }
    }
  }
};

// Function to message user later
const sendMessageToUser = async (tempId, message) => {
  const chatId = userMap.get(tempId);

  if (!chatId) throw new Error('User not linked');

  return bot.sendMessage(chatId, message);
};

module.exports = { bot, handleUpdate, sendMessageToUser };
