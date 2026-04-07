require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const TelegramUser = require('./models/TelegramUser');

const token = process.env.TELEGRAM_BOT_TOKEN;
const adminId = parseInt(process.env.TELEGRAM_ADMIN_ID, 10);

const bot = new TelegramBot(token);
console.log("🌐 Telegram bot initialized");

// =====================
// DB Helper for linking users
// =====================
async function linkUserFromApi(tempId, chatId, username) {
  if (!tempId || !chatId) throw new Error("tempId and chatId required");

  if (mongoose.connection.readyState !== 1) {
    console.log("⏳ Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000 
    });
    console.log("✅ MongoDB connected (linkUserFromApi)");
  }

  let user = await TelegramUser.findOne({ chatId }).maxTimeMS(5000);
  
  if (user) {
    if (!user.tempIds.includes(tempId)) {
      user.tempIds.push(tempId);
    }
  } else {
    user = new TelegramUser({ chatId, username, tempIds: [tempId] });
  }

  await user.save();
  console.log(`✅ TelegramUser linked: ${tempId} → ${chatId}`);
  return user;
}

// =====================
// Send message to user by tempId
// =====================
async function sendMessageToUser(tempId, message) {
  const user = await TelegramUser.findOne({ tempIds: tempId });
  if (!user) throw new Error(`User not linked to Telegram for Temp ID: ${tempId}`);
  return bot.sendMessage(user.chatId, message);
}

// =====================
// Message Handling (Forwarding & Replying)
// =====================
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // 1. Ignore /start commands as they are handled by bot.onText below
  if (text && text.startsWith('/start')) return;

  // 2. IF MESSAGE IS FROM A USER -> FORWARD TO ADMIN
  if (chatId !== adminId) {
    try {
      // Forward the original message so Admin can see context
      await bot.forwardMessage(adminId, chatId, msg.message_id);
      
      // Fallback: Send a small text block with the ID in case Admin needs to reply manually 
      // or if the user's privacy settings hide their "forward_from" info.
      await bot.sendMessage(adminId, `🆔 User ID: \`${chatId}\` (Reply to the message above to chat)`);
    } catch (err) {
      console.error("❌ Forwarding failed:", err);
    }
  }

  // 3. IF MESSAGE IS FROM ADMIN -> CHECK IF REPLIED TO A FORWARD
  else if (chatId === adminId && msg.reply_to_message) {
    let targetUserChatId;

    // Check if it's a direct forward
    if (msg.reply_to_message.forward_from) {
      targetUserChatId = msg.reply_to_message.forward_from.id;
    } 
    // If privacy settings hide 'forward_from', try to extract ID from our fallback text
    else if (msg.reply_to_message.text && msg.reply_to_message.text.includes('User ID:')) {
      const match = msg.reply_to_message.text.match(/User ID: \`?(\d+)\`?/);
      if (match) targetUserChatId = parseInt(match[1], 10);
    }

    if (targetUserChatId) {
      try {
        await bot.sendMessage(targetUserChatId, text);
        await bot.sendMessage(adminId, "✅ Reply sent to user.");
      } catch (err) {
        console.error(`❌ Failed to send reply to ${targetUserChatId}:`, err);
        await bot.sendMessage(adminId, `❌ Failed to send: ${err.message}`);
      }
    } else {
      // Admin needs to know the reply failed to extract a user ID
      await bot.sendMessage(adminId, "⚠️ Could not extract User ID from message. Please ensure you're replying to a forwarded customer message.");
      console.warn("⚠️ Admin reply failed: No valid targetUserChatId extracted from:", msg.reply_to_message);
    }
  }
});

// =====================
// /start command
// =====================
bot.onText(/^\/start(?:\s+(.+))?/, async (msg, match) => {
  try {
    const chatId = msg.chat.id;
    const tempId = match[1]; 
    const username = msg.from.username ? `@${msg.from.username}` : msg.from.first_name || "User";

    console.log("🚀 /start triggered:", { chatId, tempId });

    if (!tempId) {
      return bot.sendMessage(chatId, "👋 Welcome to Rapid Routes! Please use your specific shipment link to get started.");
    }

    await linkUserFromApi(tempId, chatId, username);

    await bot.sendMessage(chatId,
      `👋 Hi ${username}! We’ve successfully linked your Telegram.\n\n` +
      `Our team will reach out to you here regarding your parcel (Tracking ID: ${tempId}).`
    );

    await bot.sendMessage(adminId,
      `🔗 User Linked via Telegram
━━━━━━━━━━━━━━━
🆔 Temp ID: ${tempId}
👤 Username: ${username}
💬 Chat ID: ${chatId}`
    );

  } catch (err) {
    console.error("❌ /start error:", err);
    bot.sendMessage(msg.chat.id, "❌ Failed to link your Tracking ID.");
  }
});

module.exports = { bot, linkUserFromApi, sendMessageToUser };
