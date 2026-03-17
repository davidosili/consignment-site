// routes/telegramNotify.js
require('dotenv').config();
const express = require('express');
const router = express.Router();
const { bot, sendMessageToUser } = require('../telegramBot'); // updated import
const TelegramUser = require('../models/TelegramUser'); // import the MongoDB model

const adminId = parseInt(process.env.TELEGRAM_ADMIN_ID, 10);

// Notify admin + optionally message the user
router.post('/telegram', async (req, res) => {
  try {
    const { tempId, name, email, phone, address } = req.body;

    if (!tempId || !name) {
      return res.status(400).json({ error: "Missing tempId or name" });
    }

    const msgToAdmin = `📦 New Receiver Submission
━━━━━━━━━━━━━━━
👤 Name: ${name}
📧 Email: ${email || "N/A"}
📞 Phone: ${phone || "N/A"}
🏠 Address: ${address || "N/A"}
🆔 Temp ID: ${tempId}`;

    // Send message to admin
    await bot.sendMessage(adminId, msgToAdmin);

    // Check if user exists in DB
    const user = await TelegramUser.findOne({ tempId });

    if (user) {
      // Send message to the user
      await sendMessageToUser(
        tempId,
        `👋 Hi ${name}! We’ve received your delivery details.\n` +
        `Our team will reach out soon regarding your parcel (Temp ID: ${tempId}).`
      );
    } else {
      console.log(`User not linked yet for Temp ID: ${tempId}`);
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("❌ Telegram Notify Error:", err);
    res.status(500).json({ error: "Failed to send Telegram message" });
  }
});

module.exports = router;
