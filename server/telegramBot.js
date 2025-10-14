require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const token = process.env.TELEGRAM_BOT_TOKEN;
const adminId = parseInt(process.env.TELEGRAM_ADMIN_ID, 10);
const bot = new TelegramBot(token, { polling: true });

// tempId -> chatId mapping
const userMap = new Map();

// Handle errors
bot.on("polling_error", (err) => console.error("Telegram polling error:", err));

// 🔹 When a user starts the bot
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  const username = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;

  if (!text) return;

  // ✅ /start TMP-XXXX links user
  if (text.startsWith("/start")) {
    const parts = text.split(" ");
    const tempId = parts[1];

    if (tempId) {
      userMap.set(tempId, chatId);

      await bot.sendMessage(chatId,
        `💙 Hello ${username || "there"}!  
You are now connected to our customer support for your parcel (Temp ID: ${tempId}).  
Feel free to type your message here.`
      );

      await bot.sendMessage(adminId,
        `📩 New Telegram Connection:
━━━━━━━━━━━━━━━
🆔 Temp ID: ${tempId}
👤 Username: ${username}
💬 Chat ID: ${chatId}`
      );
    } else {
      await bot.sendMessage(chatId,
        "👋 Welcome to Rapid Route! Please use the link sent to your email or form to start."
      );
    }
    return;
  }

  // ✅ If admin sends a reply to a forwarded user message
  if (chatId === adminId && msg.reply_to_message?.forward_from?.id) {
    const repliedUserId = msg.reply_to_message.forward_from.id;
    await bot.sendMessage(repliedUserId, msg.text);
    return;
  }

  // ✅ If message comes from a user (not admin)
  if (chatId !== adminId) {
    // Forward message to admin
    await bot.forwardMessage(adminId, chatId, msg.message_id);
    await bot.sendMessage(adminId, 
      `💬 Message from ${username || "User"} (Chat ID: ${chatId})\nReply to this message to respond.`
    );
  }
});

// Allow backend to send direct messages too
function sendMessageToUser(tempId, message) {
  const chatId = userMap.get(tempId);
  if (!chatId) throw new Error("User not linked to Telegram yet.");
  return bot.sendMessage(chatId, message);
}

module.exports = { bot, userMap, sendMessageToUser };
