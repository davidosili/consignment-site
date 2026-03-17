require('dotenv').config();
const express = require('express');
const router = express.Router();
const { sendMessageToUser } = require('../telegramBot');
const TelegramUser = require('../models/TelegramUser');
const TelegramBot = require('node-telegram-bot-api');

const adminId = parseInt(process.env.TELEGRAM_ADMIN_ID, 10);
const BASE_URL = process.env.BASE_URL || 'https://www.rapidroutesltd.com';

// Initialize a lightweight bot instance just for sending messages
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);

router.post('/telegram', async (req, res) => {
  try {
    console.log("📨 /telegram route called with body:", req.body);

    const { tempId, name, email, phone, address } = req.body;

    if (!tempId || !name) {
      console.log("❌ Missing tempId or name in request body");
      return res.status(400).json({ error: "Missing tempId or name" });
    }

    // -------------------- Admin message --------------------
    const msgToAdmin = `📦 New Receiver Submission
━━━━━━━━━━━━━━━
👤 Name: ${name}
📧 Email: ${email || "N/A"}
📞 Phone: ${phone || "N/A"}
🏠 Address: ${address || "N/A"}
🆔 Temp ID: ${tempId}`;

    // Send admin message asynchronously, don't block response
    bot.sendMessage(adminId, msgToAdmin)
      .then(() => console.log("✅ Message sent to admin"))
      .catch(err => console.error("❌ Admin message failed:", err));

    // -------------------- Find user in DB --------------------
    console.log(`🔍 Looking for user with tempId=${tempId} in DB...`);
    const user = await TelegramUser.findOne({ tempIds: tempId });

    if (user) {
      console.log("➡️ Sending message to user...");

      // Send message asynchronously (non-blocking)
      sendMessageToUser(
        tempId,
        `👋 Hi ${name}! We’ve received your delivery details.\n` +
        `Our team will reach out soon regarding your parcel (Temp ID: ${tempId}).\n` +
        `Complete your details here: ${BASE_URL}/receiver.html?id=${tempId}`
      ).catch(err => console.error("❌ User message failed:", err));

      console.log("✅ Triggered message to user");
    } else {
      console.log(`⚠️ User not linked yet for Temp ID: ${tempId}`);
    }

    // Always respond immediately for serverless
    res.status(200).json({ success: true });

  } catch (err) {
    console.error("❌ Telegram Notify Error:", err);
    res.status(500).json({ error: "Failed to send Telegram message" });
  }
});

module.exports = router;
