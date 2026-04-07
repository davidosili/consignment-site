require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const TelegramUser = require('./models/TelegramUser');

const token = process.env.TELEGRAM_BOT_TOKEN;
const adminId = parseInt(process.env.TELEGRAM_ADMIN_ID, 10);

const bot = new TelegramBot(token);
console.log("🌐 Telegram bot initialized");

// =====================
// DB CONNECTION (Cached for Vercel Serverless)
// =====================
let cachedConnection = null;

async function ensureDbConnected() {
  if (mongoose.connection.readyState === 1) return; // Already connected
  
  if (!cachedConnection) {
    cachedConnection = mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 3000,  // ⬇️ REDUCED: Don't timeout Vercel
      connectTimeoutMS: 3000,
      socketTimeoutMS: 3000,
    });
  }
  
  await cachedConnection;
}

// =====================
// DB Helper for linking users
// =====================
async function linkUserFromApi(tempId, chatId, username) {
  if (!tempId || !chatId) throw new Error("tempId and chatId required");

  try {
    await ensureDbConnected();
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    throw new Error("Database unavailable. Please try again.");
  }

  let user = await TelegramUser.findOne({ chatId }).maxTimeMS(3000);
  
  if (user) {
    if (!user.tempIds.includes(tempId)) {
      user.tempIds.push(tempId);
    }
  } else {
    user = new TelegramUser({ 
      chatId, 
      username, 
      tempIds: [tempId],
      currentSession: { state: "IDLE" }
    });
  }

  await user.save();
  console.log(`✅ TelegramUser linked: ${tempId} → ${chatId}`);
  return user;
}

// =====================
// Send message to user by tempId (With Error Handling)
// =====================
async function sendMessageToUser(tempId, message) {
  try {
    await ensureDbConnected();
  } catch (err) {
    console.error("❌ MongoDB connection failed in sendMessageToUser:", err.message);
    throw err;
  }

  const user = await TelegramUser.findOne({ tempIds: tempId }).maxTimeMS(3000);
  if (!user || !user.chatId) {
    throw new Error(`User not linked to Telegram for Temp ID: ${tempId}`);
  }
  
  return bot.sendMessage(user.chatId, message);
}

// =====================
// Update Session State (Stateless-Safe)
// =====================
async function updateSessionState(chatId, newState, tempId = null, context = null) {
  try {
    await ensureDbConnected();
  } catch (err) {
    console.error("❌ Failed to update session (DB unavailable):", err.message);
    return null; // Graceful degradation
  }

  const user = await TelegramUser.findOne({ chatId }).maxTimeMS(3000);
  if (!user) return null;

  user.currentSession = {
    state: newState,
    tempId: tempId || user.currentSession.tempId,
    lastInteraction: new Date(),
    context: context || user.currentSession.context
  };

  await user.save();
  console.log(`📝 Session updated: ${chatId} → ${newState}`);
  return user.currentSession;
}

// =====================
// Get Session State (Stateless-Safe)
// =====================
async function getSessionState(chatId) {
  try {
    await ensureDbConnected();
  } catch (err) {
    console.error("❌ Failed to retrieve session (DB unavailable):", err.message);
    return null;
  }

  const user = await TelegramUser.findOne({ chatId }).maxTimeMS(3000);
  if (!user) return null;

  // Reset stale sessions automatically
  if (user.isSessionStale()) {
    user.currentSession = { state: "IDLE", tempId: null, context: null };
    await user.save();
  }

  return user.currentSession;
}

// =====================
// Message Handling (Forwarding & Replying)
// =====================
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || "";

  console.log(`📬 Message from ${chatId}: "${text.substring(0, 50)}..."`);

  try {
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
        
        // ✅ Mark session as awaiting admin response
        await updateSessionState(chatId, "AWAITING_ADMIN_RESPONSE", null, text);
      } catch (err) {
        console.error("❌ Forwarding to admin failed:", err.message);
        // Notify user that forwarding failed
        try {
          await bot.sendMessage(chatId, "⚠️ Failed to send your message to support. Please try again.");
        } catch (sendErr) {
          console.error("❌ Could not notify user of forwarding failure:", sendErr.message);
        }
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
          // ✅ Verify the user exists and is active before sending
          const session = await getSessionState(targetUserChatId);
          
          await bot.sendMessage(targetUserChatId, text);
          await bot.sendMessage(adminId, "✅ Reply sent to user.");
          
          // Update target user's session
          await updateSessionState(targetUserChatId, "IDLE");
        } catch (err) {
          console.error(`❌ Failed to send reply to ${targetUserChatId}:`, err.message);
          try {
            await bot.sendMessage(adminId, `❌ Failed to send: ${err.message}`);
          } catch (notifyErr) {
            console.error("❌ Could not notify admin of failure:", notifyErr.message);
          }
        }
      } else {
        // Admin needs to know the reply failed to extract a user ID
        try {
          await bot.sendMessage(adminId, "⚠️ Could not extract User ID from message. Please ensure you're replying to a forwarded customer message.");
        } catch (notifyErr) {
          console.error("❌ Could not notify admin:", notifyErr.message);
        }
        console.warn("⚠️ Admin reply failed: No valid targetUserChatId extracted from:", msg.reply_to_message);
      }
    }
  } catch (err) {
    // OUTER error handler for unexpected crashes
    console.error("❌ UNEXPECTED ERROR in message handler:", err.message, err.stack);
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
      try {
        await bot.sendMessage(chatId, "👋 Welcome to Rapid Routes! Please use your specific shipment link to get started.");
      } catch (err) {
        console.error("❌ Failed to send welcome message:", err.message);
      }
      return;
    }

    // Link the user (creates DB entry)
    await linkUserFromApi(tempId, chatId, username);

    // ✅ Initialize session state
    await updateSessionState(chatId, "IDLE", tempId);

    try {
      await bot.sendMessage(chatId,
        `👋 Hi ${username}! We've successfully linked your Telegram.\n\n` +
        `Our team will reach out to you here regarding your parcel (Tracking ID: ${tempId}).`
      );
    } catch (err) {
      console.error("❌ Failed to send welcome message to user:", err.message);
    }

    try {
      await bot.sendMessage(adminId,
        `🔗 User Linked via Telegram
━━━━━━━━━━━━━━━
🆔 Temp ID: ${tempId}
👤 Username: ${username}
💬 Chat ID: ${chatId}`
      );
    } catch (err) {
      console.error("❌ Failed to notify admin of new user:", err.message);
    }

  } catch (err) {
    console.error("❌ /start error:", err.message);
    try {
      // ✅ NOW WITH AWAIT - Promise won't silently reject
      await bot.sendMessage(chatId, "❌ Failed to link your Tracking ID. Please try again or contact support.");
    } catch (sendErr) {
      console.error("❌ CRITICAL: Could not send error message to user:", sendErr.message);
    }
  }
});

module.exports = { bot, linkUserFromApi, sendMessageToUser, updateSessionState, getSessionState };
