require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const TelegramUser = require('./models/TelegramUser');

const token = process.env.TELEGRAM_BOT_TOKEN;
const adminId = parseInt(process.env.TELEGRAM_ADMIN_ID, 10);
const BASE_URL = process.env.BASE_URL || "https://www.rapidroutesltd.com";

let bot = new TelegramBot(token);
console.log("🌐 Telegram bot initialized for webhook mode");

// =====================
// Webhook Handler for Vercel
// =====================
// This function will be called by Vercel as a serverless API endpoint
async function webhookHandler(req, res) {
  try {
    // Telegram requires POST
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    // Process the incoming update
    await bot.processUpdate(req.body);
    return res.status(200).send('OK');
  } catch (err) {
    console.error('❌ Webhook error:', err);
    return res.status(500).send('Error');
  }
}

// =====================
// /start Command
// =====================
bot.onText(/^\/start(?:\s+(.+))?/, async (msg, match) => {
  try {
    const chatId = msg.chat.id;
    const tempId = match[1]; // TMP-XXXX
    const username = msg.from.username
      ? `@${msg.from.username}`
      : msg.from.first_name || "User";

    console.log("🚀 /start triggered:", { chatId, tempId });

    if (!tempId) {
      return bot.sendMessage(chatId,
        "👋 Welcome to Rapid Routes!\nPlease use your shipment link."
      );
    }

    // Save or update user
    let user = await TelegramUser.findOne({ chatId });
    if (!user) {
      user = new TelegramUser({ chatId, username, tempIds: [tempId] });
    } else if (!user.tempIds.includes(tempId)) {
      user.tempIds.push(tempId);
    }
    await user.save();

    // Send auto message with receiver link
    await bot.sendMessage(chatId,
      `💙 Hello ${username}!\nTracking ID: ${tempId}\n` +
      `Complete your details here:\n${BASE_URL}/receiver.html?id=${tempId}`
    );

    // Notify admin
    await bot.sendMessage(adminId,
      `📩 New Telegram Connection
━━━━━━━━━━━━━━━
🆔 Temp ID: ${tempId}
👤 Username: ${username}
💬 Chat ID: ${chatId}`
    );

    console.log("✅ User linked and admin notified");

  } catch (err) {
    console.error("❌ /start error:", err);
  }
});

// =====================
// Forwarding & Admin Replies
// =====================
bot.on('message', async (msg) => {
  try {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    const username = msg.from.username
      ? `@${msg.from.username}`
      : msg.from.first_name || "User";

    if (text?.startsWith("/start")) return; // handled separately

    // Admin replying to user
    if (chatId === adminId && msg.reply_to_message) {
      const repliedUserId =
        msg.reply_to_message.forward_from?.id ||
        msg.reply_to_message?.chat?.id;

      if (repliedUserId) {
        if (text) await bot.sendMessage(repliedUserId, text);
        if (msg.photo) await bot.sendPhoto(repliedUserId, msg.photo[msg.photo.length-1].file_id, { caption: msg.caption || "" });
        if (msg.document) await bot.sendDocument(repliedUserId, msg.document.file_id, { caption: msg.caption || "" });
        if (msg.video) await bot.sendVideo(repliedUserId, msg.video.file_id, { caption: msg.caption || "" });
        console.log("✅ Admin reply sent");
      }
      return;
    }

    // Forward user messages to admin
    if (chatId !== adminId) {
      await bot.forwardMessage(adminId, chatId, msg.message_id);
      if (msg.caption) await bot.sendMessage(adminId, `📝 Caption: ${msg.caption}`);
      await bot.sendMessage(adminId, `💬 Message from ${username} (Chat ID: ${chatId})\nReply to respond.`);
      console.log(`🔹 Forwarded message from ${chatId} to admin`);
    }

  } catch (err) {
    console.error("❌ Message error:", err);
  }
});

// =====================
// Admin command: /msg TMP-XXXX <text>
// =====================
bot.onText(/^\/msg\s+(\S+)\s+(.+)/, async (msg, match) => {
  if (!match || msg.chat.id !== adminId) return;
  const tempId = match[1];
  const messageText = match[2];

  const user = await TelegramUser.findOne({ tempIds: tempId });
  if (!user) return bot.sendMessage(adminId, `❌ No user linked for ${tempId}`);

  await bot.sendMessage(user.chatId, `📬 Admin: ${messageText}`);
  await bot.sendMessage(adminId, `✅ Sent to ${tempId}`);
});

// =====================
// Backend → User Messaging
// =====================
async function sendMessageToUser(tempId, message) {
  const user = await TelegramUser.findOne({ tempIds: tempId });
  if (!user) throw new Error("User not linked to Telegram");
  return bot.sendMessage(user.chatId, message);
}

module.exports = { bot, webhookHandler, sendMessageToUser };
